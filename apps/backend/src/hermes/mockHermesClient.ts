import type { LiveRobotMap, RobotPoi } from '@hermes/shared';
import { HermesClient, type HermesAction } from './hermesClient';
import { getWorld } from '../db/memory';

/** Connected-device preview. The fallback fetcher throws: no hardware network access. */
export class MockHermesClient extends HermesClient {
  private sequence = 0;
  private actions = new Set<number>();
  private readonly home = { x: 2, y: 10, yaw: 0 };
  private pois: RobotPoi[] = [
    ['หน้าประตู', 2, 2, ['ทางเข้า', 'entrance']],
    ['จุดต้อนรับ', 5, 7, ['เคาน์เตอร์', 'reception']],
    ['ห้องประชุม', 15, 9, ['ห้องมีตติ้ง', 'meeting room']],
    ['ห้องครัว', 15, 3, ['จุดกาแฟ', 'pantry']],
  ].map(([name, x, y, aliases], i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    pose: { x: x as number, y: y as number, yaw: 0 }, metadata: { display_name: name, aliases, is_public: true } }));

  constructor() {
    super('http://mock.invalid', (async () => { throw new Error('Mock Test forbids hardware requests'); }) as typeof fetch, false);
  }
  override async sample() {
    const sim = getWorld().sim;
    if (sim.mode === 'stopped') sim.lastTelemetryAt = Date.now();
    else sim.tick();
    return { batteryPct: sim.batteryPct, x: sim.x, y: sim.y, headingDeg: sim.headingDeg,
      speedMps: sim.speed, uptimeSec: sim.uptimeSec, capturedAt: sim.lastTelemetryAt };
  }
  override async inspectMap(): ReturnType<HermesClient['inspectMap']> {
    const width = 104, height = 72, resolution = 0.2;
    const cells = Buffer.alloc(width * height, 127);
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      if (col < 2 || row < 2 || col >= width - 2 || row >= height - 2
        || (col >= 54 && col <= 55 && !(row >= 35 && row <= 47))
        || (row >= 31 && row <= 32 && col > 55 && !(col >= 74 && col <= 83))) cells[row * width + col] = 255;
    }
    const sim = getWorld().sim;
    const pose = { x: sim.x, y: sim.y, yaw: sim.headingDeg * Math.PI / 180 };
    const laser_points = Array.from({ length: 360 }, (_, i) => {
      const angle = i * Math.PI / 180;
      const direction = angle + pose.yaw;
      let distance = 0.05;
      for (; distance < 18; distance += 0.05) {
        const col = Math.floor((pose.x + Math.cos(direction) * distance + 1) / resolution);
        const row = Math.floor((pose.y + Math.sin(direction) * distance + 1) / resolution);
        if (col < 0 || row < 0 || col >= width || row >= height || cells[row * width + col] === 255) break;
      }
      return { angle, distance, valid: true };
    });
    return { x: -1, y: -1, width, height, resolution, cellsBase64: cells.toString('base64'),
      localizationQuality: 95, home: { ...this.home }, poiCount: this.pois.length, pois: await this.listPois(),
      laser: { pose, laser_points }, modelName: 'Hermes Pro Max · MOCK TEST', softwareVersion: 'mock-preview-1',
      dockingStatus: sim.mode === 'docking' ? 'docking' : Math.hypot(sim.x - this.home.x, sim.y - this.home.y) < 0.2 ? 'docked' : 'undocked',
      mappingEnabled: false, capturedAt: new Date().toISOString() };
  }
  override async listPois() { return structuredClone(this.pois); }
  override async savePoi(poi: RobotPoi, update = false) {
    const index = this.pois.findIndex(item => item.id === poi.id);
    if (update && index < 0) throw new Error('Mock POI does not exist');
    if (!update && index >= 0) throw new Error('Mock POI already exists');
    const saved = structuredClone({ ...poi, metadata: { ...(index >= 0 ? this.pois[index].metadata : {}), ...poi.metadata } });
    if (update) this.pois[index] = saved; else this.pois.push(saved);
    return structuredClone(saved);
  }
  override async deletePoi(id: string) { this.pois = this.pois.filter(poi => poi.id !== id); }
  private accept(): HermesAction { const action_id = ++this.sequence; this.actions.add(action_id); return { action_id }; }
  override async moveTo(x: number, y: number, _yaw: number | null) {
    getWorld().sim.startNavigation({ x, y, poiCode: getWorld().activeJob()?.destPoiCode ?? 'XY' }); return this.accept();
  }
  override async goHome() { getWorld().sim.startDocking({ ...this.home, poiCode: 'DOCK' }); return this.accept(); }
  override async action(id: number): Promise<HermesAction> {
    if (!this.actions.has(id)) throw new Error('Unknown mock action');
    return { action_id: id, state: { status: getWorld().sim.target ? 1 : 4, result: 0 } };
  }
  override async configureMotionLimits(_linear: number, _angular: number) { /* Local preview only. */ }
  override async moveBy(vx: number, vyaw: number) { getWorld().sim.setManual(vx, vyaw); return this.accept(); }
  override async abort() {
    const sim = getWorld().sim;
    if (sim.mode === 'manual') sim.halt(); else sim.releaseToIdle();
  }
  override async emergencyStop() { getWorld().sim.estop(); }
  override async clearEmergencyStop() { getWorld().sim.releaseToIdle(); }
}
