import { parseExploreMap } from './gridMap';
import type { RobotPoi, LiveRobotMap } from '@hermes/shared';
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

  async inspectMap() {
    const response = await this.fetcher(`${this.base}/api/core/slam/v1/maps/explore`, {
      method: 'GET', signal: AbortSignal.timeout(5000),
    });
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
    const bytes = Buffer.concat(chunks, size);
    const map = parseExploreMap(bytes);
    const [quality, home, pois, info, power, mappingEnabled, laser] = await Promise.all([
      this.request<number>('GET', '/api/core/slam/v1/localization/quality').catch(() => null),
      this.request<{ x: number; y: number; yaw: number }>('GET', '/api/core/slam/v1/homepose').catch(() => null),
      this.listPois().catch(() => null),
      this.request<{ modelName: string; softwareVersion: string }>('GET', '/api/core/system/v1/robot/info').catch(() => null),
      this.request<{ dockingStatus: string }>('GET', '/api/core/system/v1/power/status').catch(() => null),
      this.request<boolean>('GET', '/api/core/slam/v1/mapping/:enable').catch(() => null),
      this.request<LiveRobotMap['laser']>('GET', '/api/core/system/v1/laserscan').catch(() => null),
    ]);
    return { ...map, localizationQuality: typeof quality === 'number' && Number.isFinite(quality) ? quality : null,
      home: home && [home.x, home.y, home.yaw].every(Number.isFinite) ? home : null,
      poiCount: Array.isArray(pois) ? pois.length : null,
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
    const saved = (await this.listPois()).find(item => item.id === poi.id);
      if (!saved || saved.metadata?.display_name !== poi.metadata?.display_name
        || (Array.isArray(poi.metadata?.aliases) && JSON.stringify(saved.metadata?.aliases) !== JSON.stringify(poi.metadata.aliases)) || !saved.pose || !poi.pose
      || ![saved.pose.x, saved.pose.y, saved.pose.yaw].every(Number.isFinite)
      || Math.abs(saved.pose.x - poi.pose.x) > 0.01 || Math.abs(saved.pose.y - poi.pose.y) > 0.01
      || Math.abs(Math.atan2(Math.sin(saved.pose.yaw - poi.pose.yaw), Math.cos(saved.pose.yaw - poi.pose.yaw))) > 0.01) {
      throw new Error('POI write could not be verified; refresh the map before retrying');
    }
    return saved;
  }

  async deletePoi(id: string): Promise<void> {
    const accepted = await this.request<boolean>('DELETE', `/api/core/artifact/v1/pois/${encodeURIComponent(id)}`);
    if (accepted !== true) throw new Error('Robot rejected POI deletion');
    if ((await this.listPois()).some(poi => poi.id === id)) throw new Error('POI deletion could not be verified');
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

  async configureMotionLimits(linear: number, angular: number): Promise<void> {
    if (![linear, angular].every((value) => Number.isFinite(value) && value > 0)) throw new Error('Invalid motion limit');
    for (const [param, limit] of [['base.max_moving_speed', linear], ['base.max_angular_speed', angular]] as const) {
      const current = Number(await this.request<string>('GET', `/api/core/system/v1/parameter?param=${param}`));
      if (!Number.isFinite(current) || current <= 0) throw new Error(`Cannot verify ${param}`);
      if (current > limit) {
        const accepted = await this.request<boolean>('PUT', '/api/core/system/v1/parameter', { param, value: String(limit) });
        if (accepted !== true) throw new Error(`Robot rejected ${param}`);
      }
      const verified = Number(await this.request<string>('GET', `/api/core/system/v1/parameter?param=${param}`));
      if (!Number.isFinite(verified) || verified <= 0 || verified > limit + 0.000001) throw new Error(`Robot speed limit was not confirmed: ${param}`);
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
