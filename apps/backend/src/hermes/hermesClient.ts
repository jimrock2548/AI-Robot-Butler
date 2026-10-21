import { parseExploreMap } from './gridMap';
import type { RobotPoi, LiveRobotMap, RobotWall } from '@hermes/shared';
/** SLAMTEC Slamware REST API. See https://docs.slamtec.com/opt/swagger-conf.json */
export interface HermesSample {
  batteryPct: number;
  x: number;
  y: number;
  headingDeg: number;
  speedMps: number | null;
  uptimeSec: number | null;
  capturedAt: number;
}

export interface HermesAction {
  action_id: number;
  state?: { status?: number; result?: number; reason?: string };
}

export class HermesClient {
  private readonly base: string;

  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch, private readonly readOnly = true) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HERMES_BASE_URL must be HTTP(S)');
    this.base = url.toString().replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = 1500): Promise<T> {
    if (this.readOnly && method !== 'GET') throw new Error('Hermes is read-only: robot commands are disabled');
    const response = await this.fetcher(`${this.base}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Hermes ${method} ${path}: HTTP ${response.status}`);
    if (response.status === 204) return undefined as T;
    const data = await response.text();
    if (!data) return undefined as T;
    try { return JSON.parse(data) as T; }
    catch { return data as T; }
  }

  /** Firmware acknowledges writes before GET caches catch up. Poll before reporting success or rollback. */
  private async waitFor<T>(read: () => Promise<T>, accepts: (value: T) => boolean, message: string): Promise<T> {
    const deadline = Date.now() + 4000;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (Date.now() < deadline);
    throw new Error(message);
  }

  async sample(): Promise<HermesSample> {
    const [power, pose, speed, runtime] = await Promise.all([
      this.request<{ batteryPercentage: number }>('GET', '/api/core/system/v1/power/status'),
      this.request<{ x: number; y: number; yaw: number }>('GET', '/api/core/slam/v1/localization/pose'),
      this.request<{ vx: number; vy: number }>('GET', '/api/core/motion/v1/speed').catch((error: unknown) => {
        if (String(error).includes('HTTP 404')) return null;
        throw error;
      }),
      this.request<number>('GET', '/api/core/statistics/v1/runtime').catch(() => null),
    ]);
    if (![power?.batteryPercentage, pose?.x, pose?.y, pose?.yaw].every(Number.isFinite)
      || (speed !== null && ![speed?.vx, speed?.vy].every(Number.isFinite))) {
      throw new Error('Hermes telemetry response is incomplete');
    }
    return {
      batteryPct: power.batteryPercentage,
      x: pose.x,
      y: pose.y,
      headingDeg: ((pose.yaw * 180 / Math.PI) % 360 + 360) % 360,
      speedMps: speed === null ? null : Math.hypot(speed.vx, speed.vy),
      uptimeSec: typeof runtime === 'number' && Number.isFinite(runtime) ? runtime : null,
      capturedAt: Date.now(),
    };
  }

  private async exploreMapBytes(allowMissing = false): Promise<Buffer | null> {
    const response = await this.fetcher(`${this.base}/api/core/slam/v1/maps/explore`, {
      method: 'GET', signal: AbortSignal.timeout(5000),
    });
    if (allowMissing && (response.status === 404 || response.status === 204)) return null;
    if (!response.ok) throw new Error(`Hermes map: HTTP ${response.status}`);
    const maxBytes = 20_000_036;
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Hermes map is too large');
    if (!response.body) throw new Error('Hermes map response is empty');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Hermes map is too large'); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks, size);
  }

  async clearMap(): Promise<void> {
    const accepted = await this.request<unknown>('DELETE', '/api/core/slam/v1/maps', undefined, 10000);
    if (accepted === false) throw new Error('Robot rejected clearing the map');
    await this.waitFor(() => this.exploreMapBytes(true), bytes => {
      if (bytes === null) return true;
      if (bytes.length < 36) return false;
      const count = bytes.readUInt32LE(32), width = bytes.readUInt32LE(8), height = bytes.readUInt32LE(12);
      return count === width * height && bytes.length === 36 + count && bytes.subarray(36).every(cell => cell === 0);
    }, 'Map clear was not confirmed; restore the backup before retrying');
  }

  async inspectMap(): Promise<LiveRobotMap> {
    const map = parseExploreMap((await this.exploreMapBytes())!);
    const [quality, home, pois, info, power, mappingEnabled, laser, walls] = await Promise.all([
      this.request<number>('GET', '/api/core/slam/v1/localization/quality').catch(() => null),
      this.request<{ x: number; y: number; yaw: number }>('GET', '/api/core/slam/v1/homepose').catch(() => null),
      this.listPois().catch(() => null),
      this.request<{ modelName: string; softwareVersion: string }>('GET', '/api/core/system/v1/robot/info').catch(() => null),
      this.request<{ dockingStatus: string }>('GET', '/api/core/system/v1/power/status').catch(() => null),
      this.request<boolean>('GET', '/api/core/slam/v1/mapping/:enable').catch(() => null),
      this.request<LiveRobotMap['laser']>('GET', '/api/core/system/v1/laserscan').catch(() => null),
      this.listWalls().catch(() => null),
    ]);
    return { ...map, localizationQuality: typeof quality === 'number' && Number.isFinite(quality) ? quality : null,
      home: home && [home.x, home.y, home.yaw].every(Number.isFinite) ? home : null,
      poiCount: Array.isArray(pois) ? pois.length : null, walls,
      pois, laser: laser && [laser.pose?.x, laser.pose?.y, laser.pose?.yaw].every(Number.isFinite) && Array.isArray(laser.laser_points) ? laser : null,
      modelName: info?.modelName ?? null, softwareVersion: info?.softwareVersion ?? null,
      dockingStatus: power?.dockingStatus ?? null, mappingEnabled: typeof mappingEnabled === 'boolean' ? mappingEnabled : null,
      capturedAt: new Date().toISOString() };
  }

  async listPois(): Promise<RobotPoi[]> {
    const pois = await this.request<RobotPoi[]>('GET', '/api/core/artifact/v1/pois', undefined, 5000);
    if (!Array.isArray(pois) || pois.some(poi => typeof poi?.id !== 'string')) throw new Error('Invalid robot POI list');
    return pois.map(poi => {
      // Slamware MapMetaData is a string-to-string map. Keep the app's aliases
      // array contract while storing it as a JSON string on the robot.
      if (typeof poi.metadata?.aliases !== 'string') return poi;
      try {
        const aliases: unknown = JSON.parse(poi.metadata.aliases);
        if (Array.isArray(aliases) && aliases.every(alias => typeof alias === 'string')) {
          return { ...poi, metadata: { ...poi.metadata, aliases } };
        }
      } catch { /* Preserve unrecognized metadata from other robot clients. */ }
      return poi;
    });
  }

  async getMotionLimits() {
    const [linearMps, angularRps] = await Promise.all(['base.max_moving_speed', 'base.max_angular_speed'].map(async param =>
      Number(await this.request<string>('GET', `/api/core/system/v1/parameter?param=${param}`))));
    if (![linearMps, angularRps].every(v => Number.isFinite(v) && v > 0)) throw new Error('Cannot read robot motion limits');
    return { linearMps, angularRps };
  }

  async setMotionLimits(linearMps: number, angularRps: number): Promise<void> {
    if (![linearMps, angularRps].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid motion limit');
    const before = await this.getMotionLimits();
    const write = async (linear: number, angular: number) => {
      for (const [param, value] of [['base.max_moving_speed', linear], ['base.max_angular_speed', angular]] as const) {
        if (await this.request<boolean>('PUT', '/api/core/system/v1/parameter', { param, value: String(value) }) !== true) throw new Error(`Robot rejected ${param}`);
      }
    };
    try {
      await write(linearMps, angularRps);
      await this.waitFor(() => this.getMotionLimits(), actual => Math.abs(actual.linearMps - linearMps) <= 0.00001 && Math.abs(actual.angularRps - angularRps) <= 0.00001, 'Robot did not confirm requested speed');
    } catch (error) {
      try {
        await write(before.linearMps, before.angularRps);
        await this.waitFor(() => this.getMotionLimits(), actual => Math.abs(actual.linearMps - before.linearMps) <= 0.00001 && Math.abs(actual.angularRps - before.angularRps) <= 0.00001, 'Speed rollback was not confirmed');
      }
      catch { throw new Error(`Speed update failed and rollback was not confirmed: ${String(error)}`); }
      throw error;
    }
  }

  async getOperatingMode() {
    const mappingEnabled = await this.request<boolean>('GET', '/api/core/slam/v1/mapping/:enable');
    if (typeof mappingEnabled !== 'boolean') throw new Error('Invalid mapping mode');
    return { mode: mappingEnabled ? 'exploration' as const : 'normal' as const, mappingEnabled };
  }

  async setOperatingMode(mode: 'normal' | 'exploration') {
    const enable = mode === 'exploration';
    if (await this.request<boolean>('PUT', '/api/core/slam/v1/mapping/:enable', { enable }) !== true) throw new Error('Robot rejected mapping mode');
    const actual = await this.waitFor(() => this.getOperatingMode(), value => value.mappingEnabled === enable, 'Robot mode could not be verified');
    return actual;
  }

  async listWalls(): Promise<RobotWall[]> {
    const result = await this.request<RobotWall[]>('GET', '/api/core/artifact/v1/lines/walls', undefined, 5000);
    if (!Array.isArray(result) || result.some(w => !Number.isInteger(w.id) || ![w.start?.x, w.start?.y, w.end?.x, w.end?.y].every(Number.isFinite))) throw new Error('Invalid virtual wall list');
    return result;
  }

  async saveWall(wall: Omit<RobotWall, 'id'>, id?: number): Promise<RobotWall> {
    const before = await this.listWalls();
    if (id !== undefined && !before.some(w => w.id === id)) throw new Error('Wall no longer exists');
    if (await this.request<boolean>(id === undefined ? 'POST' : 'PUT', '/api/core/artifact/v1/lines/walls', [{ ...wall, id: id ?? 0 }]) !== true) throw new Error('Robot rejected wall');
    const saved = await this.waitFor(async () => (await this.listWalls()).find(w => (id === undefined ? !before.some(b => b.id === w.id) : w.id === id)
      && Math.hypot(w.start.x - wall.start.x, w.start.y - wall.start.y, w.end.x - wall.end.x, w.end.y - wall.end.y) < 0.01), value => !!value, 'Virtual wall write was not confirmed; refresh before retrying');
    return saved!;
  }

  async deleteWall(id: number) {
    if (await this.request<boolean>('DELETE', `/api/core/artifact/v1/lines/walls/${id}`) !== true) throw new Error('Robot rejected wall deletion');
    await this.waitFor(() => this.listWalls(), list => !list.some(w => w.id === id), 'Virtual wall deletion was not confirmed');
  }

  async downloadCompositeMap(): Promise<Buffer> {
    const response = await this.fetcher(`${this.base}/api/core/slam/v1/maps/stcm`, { method: 'GET', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new Error(`Composite map download: HTTP ${response.status}`);
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 20_000_000) { await reader.cancel(); throw new Error('Composite map exceeds 20 MB'); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    if (size < 4) throw new Error('Composite map is empty');
    return Buffer.concat(chunks, size);
  }

  async uploadCompositeMap(bytes: Buffer): Promise<void> {
    if (this.readOnly) throw new Error('Hermes is read-only: robot commands are disabled');
    if (bytes.length < 4 || bytes.length > 20_000_000) throw new Error('Invalid composite map size');
    const response = await this.fetcher(`${this.base}/api/core/slam/v1/maps/stcm`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Composite map upload: HTTP ${response.status}`);
    const reply = (await response.text()).trim();
    if (reply === 'false') throw new Error('Robot rejected composite map');
  }

  async setPose(x: number, y: number, yaw: number) {
    const accepted = await this.request('PUT', '/api/core/slam/v1/localization/pose', { x, y, z: 0, yaw, pitch: 0, roll: 0 }, 5000);
    if (accepted === false) throw new Error('Robot rejected pose');
    const pose = await this.waitFor(() => this.request<{ x: number; y: number; yaw: number }>('GET', '/api/core/slam/v1/localization/pose'),
      value => [value?.x, value?.y, value?.yaw].every(Number.isFinite) && Math.hypot(value.x - x, value.y - y) <= 0.25
        && Math.abs(Math.atan2(Math.sin(value.yaw - yaw), Math.cos(value.yaw - yaw))) <= 0.15, 'Robot pose was not confirmed');
    return pose;
  }

  async savePoi(poi: RobotPoi, update = false): Promise<RobotPoi> {
    if (update) {
      const current = (await this.listPois()).find(item => item.id === poi.id);
      if (!current) throw new Error('Robot POI no longer exists');
      poi = { ...poi, metadata: { ...current.metadata, ...poi.metadata } };
    }
    const metadata = Object.fromEntries(Object.entries(poi.metadata ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    const accepted = await this.request<unknown>(update ? 'PUT' : 'POST',
      `/api/core/artifact/v1/pois${update ? '/' + encodeURIComponent(poi.id) : ''}`,
      update ? { pose: poi.pose, metadata } : { ...poi, metadata }, 10000);
    if (accepted === false) throw new Error('Robot rejected POI');
    const saved = await this.waitFor(async () => (await this.listPois()).find(item => item.id === poi.id), value => !!value
      && value.metadata?.display_name === poi.metadata?.display_name
      && (!Array.isArray(poi.metadata?.aliases) || JSON.stringify(value.metadata?.aliases) === JSON.stringify(poi.metadata.aliases))
      && !!value.pose && !!poi.pose && [value.pose.x, value.pose.y, value.pose.yaw].every(Number.isFinite)
      && Math.abs(value.pose.x - poi.pose.x) <= 0.01 && Math.abs(value.pose.y - poi.pose.y) <= 0.01
      && Math.abs(Math.atan2(Math.sin(value.pose.yaw - poi.pose.yaw), Math.cos(value.pose.yaw - poi.pose.yaw))) <= 0.01,
      'POI write could not be verified; refresh the map before retrying');
    return saved!;
  }

  async deletePoi(id: string): Promise<void> {
    const accepted = await this.request<boolean>('DELETE', `/api/core/artifact/v1/pois/${encodeURIComponent(id)}`);
    if (accepted !== true) throw new Error('Robot rejected POI deletion');
    await this.waitFor(() => this.listPois(), list => !list.some(poi => poi.id === id), 'POI deletion could not be verified');
  }

  moveTo(x: number, y: number, yawDeg: number | null): Promise<HermesAction> {
    const move_options = yawDeg === null ? { mode: 0 } : { mode: 0, flags: ['with_yaw'], yaw: yawDeg * Math.PI / 180 };
    return this.request('POST', '/api/core/motion/v1/actions', {
      action_name: 'slamtec.agent.actions.MoveToAction', options: { target: { x, y, z: 0 }, move_options },
    });
  }

  goHome(): Promise<HermesAction> {
    return this.request('POST', '/api/core/motion/v1/actions', {
      action_name: 'slamtec.agent.actions.GoHomeAction', options: { gohome_options: { flags: 'dock' } },
    });
  }

  action(id: number): Promise<HermesAction> {
    return this.request('GET', `/api/core/motion/v1/actions/${id}`);
  }

  async currentAction(): Promise<HermesAction | null> {
    try {
      const action = await this.request<HermesAction>('GET', '/api/core/motion/v1/actions/:current');
      if (!Number.isInteger(action?.action_id) || !Number.isInteger(action.state?.status)) throw new Error('Cannot verify current robot action');
      return action;
    } catch (error) { if (String(error).includes('HTTP 404')) return null; throw error; }
  }

  async configureMotionLimits(linear: number, angular: number): Promise<void> {
    if (![linear, angular].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Invalid motion limit');
    for (const [param, limit] of [['base.max_moving_speed', linear], ['base.max_angular_speed', angular]] as const) {
      const current = Number(await this.request<string>('GET', `/api/core/system/v1/parameter?param=${param}`));
      if (!Number.isFinite(current) || current <= 0) throw new Error(`Cannot verify ${param}`);
      if (current > limit) {
        const accepted = await this.request<boolean>('PUT', '/api/core/system/v1/parameter', { param, value: String(limit) });
        if (accepted !== true) throw new Error(`Robot rejected ${param}`);
      }
      await this.waitFor(async () => Number(await this.request<string>('GET', `/api/core/system/v1/parameter?param=${param}`)),
        verified => Number.isFinite(verified) && verified > 0 && verified <= limit + 0.000001, `Robot speed limit was not confirmed: ${param}`);
    }
  }

  clearEmergencyStop(): Promise<void> {
    return this.request<boolean>('PUT', '/api/core/system/v1/parameter', { param: 'base.emergency_stop', value: 'off' })
      .then((accepted) => { if (accepted !== true) throw new Error('Hermes rejected emergency stop reset'); });
  }

  abort(): Promise<void> {
    return this.request<void>('DELETE', '/api/core/motion/v1/actions/:current').catch((error: unknown) => {
      if (!String(error).includes('HTTP 404')) throw error;
    });
  }

  /** MoveByAction has no obstacle avoidance; each pulse is short and requires an active manual lock. */
  moveBy(vx: number, vyaw: number): Promise<HermesAction | void> {
    if (vx === 0 && vyaw === 0) return this.abort();
    const options = Math.abs(vx) >= Math.abs(vyaw)
      ? { direction: vx > 0 ? 0 : 1, duration: 200 }
      : { direction: vyaw > 0 ? 3 : 2, duration: 200 };
    return this.request('POST', '/api/core/motion/v1/actions', {
      action_name: 'slamtec.agent.actions.MoveByAction', options,
    });
  }

  emergencyStop(): Promise<void> {
    return this.request<boolean>('PUT', '/api/core/system/v1/parameter', { param: 'base.emergency_stop', value: 'on' })
      .then((accepted) => { if (accepted !== true) throw new Error('Hermes rejected emergency stop'); });
  }
}
