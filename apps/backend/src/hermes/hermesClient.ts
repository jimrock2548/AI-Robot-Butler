/** SLAMTEC Slamware REST API. See https://docs.slamtec.com/opt/swagger-conf.json */
export interface HermesSample {
  batteryPct: number;
  x: number;
  y: number;
  headingDeg: number;
  speedMps: number;
  uptimeSec: number | null;
  capturedAt: number;
}

export interface HermesAction {
  action_id: number;
  state?: { status?: number; result?: number; reason?: string };
}

export class HermesClient {
  private readonly base: string;

  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HERMES_BASE_URL must be HTTP(S)');
    this.base = url.toString().replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetcher(`${this.base}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
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
      this.request<{ vx: number; vy: number }>('GET', '/api/core/motion/v1/speed'),
      this.request<number>('GET', '/api/core/statistics/v1/runtime').catch(() => null),
    ]);
    if (![power?.batteryPercentage, pose?.x, pose?.y, pose?.yaw, speed?.vx, speed?.vy].every(Number.isFinite)) {
      throw new Error('Hermes telemetry response is incomplete');
    }
    return {
      batteryPct: power.batteryPercentage,
      x: pose.x,
      y: pose.y,
      headingDeg: ((pose.yaw * 180 / Math.PI) % 360 + 360) % 360,
      speedMps: Math.hypot(speed.vx, speed.vy),
      uptimeSec: typeof runtime === 'number' && Number.isFinite(runtime) ? runtime : null,
      capturedAt: Date.now(),
    };
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
