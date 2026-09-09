/**
 * โหมด DB_MODE=memory — ข้อมูลในหน่วยความจำ + หุ่นจำลอง
 * โครงสร้างแถวตรงกับ prisma/schema.prisma (spec §7)
 *
 * หมายเหตุ: เมื่อต่อ PostgreSQL จริง จะแทนชั้นนี้ด้วย Prisma client
 */
import argon2 from '@node-rs/argon2';
import type {
  AiConversation,
  AiRejection,
  AuditEntry,
  JobSource,
  JobStatus,
  KeepoutZone,
  MapStatus,
  Poi,
  RoomShape,
  UserRole,
} from '@hermes/shared';
import { RobotSim } from '../sim/robotSim';
import { config } from '../config';

export interface UserRow {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RobotRow {
  id: number;
  code: string;
  model: string;
  baseUrl: string;
  isEnabled: boolean;
}

export interface MapRow {
  id: number;
  robotId: number;
  version: number;
  status: MapStatus;
  name: string;
  widthM: number;
  heightM: number;
  rooms: RoomShape[];
  slamMapRef: string | null;
  createdBy: number | null;
  publishedBy: number | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface PoiRow {
  id: number;
  mapId: number;
  code: string;
  nameTh: string;
  nameEn: string;
  x: number;
  y: number;
  headingDeg: number | null;
  zone: string | null;
  isPublic: boolean;
  isDock: boolean;
  sortOrder: number;
}

export interface KeepoutRow {
  id: number;
  mapId: number;
  name: string;
  polygon: [number, number][];
}

export interface JobRow {
  id: number;
  ref: string;
  robotId: number;
  mapVersion: number;
  destPoiCode: string;
  destName: string;
  source: JobSource;
  requestedBy: number | null;
  status: JobStatus;
  distanceM: number | null;
  departedAt: string | null;
  arrivedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface JobEventRow {
  id: number;
  jobId: number;
  at: string;
  kind: string;
  detail: Record<string, unknown> | null;
}

export interface TelemetryRow {
  robotId: number;
  at: string;
  batteryPct: number;
  x: number;
  y: number;
  headingDeg: number;
  speedMps: number;
  wifiDbm: number;
  cpuPct: number;
}

export interface LockRow {
  robotId: number;
  /** null = กiosk (จอหุ่น) ถือ lock */
  heldBy: number | null;
  mode: 'manual' | 'auto';
  acquiredAt: string;
  /** null = ไม่หมดอายุ (lock ของ job auto) */
  expiresAt: string | null;
}

export interface AuditRow {
  id: number;
  at: string;
  userId: number | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
}

export class World {
  sim = new RobotSim();
  users: UserRow[] = [];
  robots: RobotRow[] = [];
  maps: MapRow[] = [];
  pois: PoiRow[] = [];
  keepouts: KeepoutRow[] = [];
  jobs: JobRow[] = [];
  jobEvents: JobEventRow[] = [];
  telemetrySamples: TelemetryRow[] = [];
  lock: LockRow | null = null;
  audit: AuditRow[] = [];
  aiRejections: AiRejection[] = [];
  aiConversations: AiConversation[] = [];

  /** ลำดับ ID ในหน่วยความจำ (แทน AUTOINCREMENT ของ PostgreSQL) */
  seq = { user: 0, map: 0, poi: 0, keepout: 0, job: 0, event: 0, audit: 0, jobRef: 0 };

  // ── lookups ──────────────────────────────────────────────
  getUser(id: number): UserRow | undefined {
    return this.users.find((u) => u.id === id);
  }
  getUserByName(username: string): UserRow | undefined {
    return this.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }
  robot(): RobotRow {
    return this.robots[0];
  }
  findPublishedMap(): MapRow | undefined {
    return this.maps.find((m) => m.status === 'published');
  }
  findDraftMap(): MapRow | undefined {
    return this.maps.find((m) => m.status === 'draft');
  }
  mapPois(mapId: number): PoiRow[] {
    return this.pois.filter((p) => p.mapId === mapId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  publishedPois(): PoiRow[] {
    const m = this.findPublishedMap();
    return m ? this.mapPois(m.id) : [];
  }
  activeJob(): JobRow | undefined {
    return this.jobs.find((j) => j.status === 'queued' || j.status === 'navigating');
  }
  userName(id: number | null): string | null {
    if (id === null) return 'จอหุ่น (Kiosk)';
    return this.getUser(id)?.displayName ?? null;
  }

  // ── mutations ────────────────────────────────────────────
  addAudit(userId: number | null, action: string, target: string | null, detail?: Record<string, unknown> | null, ip?: string): void {
    this.audit.push({
      id: ++this.seq.audit,
      at: new Date().toISOString(),
      userId,
      action,
      target,
      detail: detail ?? null,
      ip: ip ?? null,
    });
  }

  addJobEvent(jobId: number, kind: string, detail?: Record<string, unknown> | null): void {
    this.jobEvents.push({ id: ++this.seq.event, jobId, at: new Date().toISOString(), kind, detail: detail ?? null });
  }

  nextJobRef(): string {
    this.seq.jobRef += 1;
    return `HX-${String(this.seq.jobRef).padStart(4, '0')}`;
  }

  addTelemetrySample(): void {
    const s = this.sim;
    this.telemetrySamples.push({
      robotId: this.robot().id,
      at: new Date().toISOString(),
      batteryPct: round2(s.batteryPct),
      x: round2(s.x),
      y: round2(s.y),
      headingDeg: round2(s.headingDeg),
      speedMps: round2(s.speed),
      wifiDbm: s.wifiDbm,
      cpuPct: s.cpuPct,
    });
    if (this.telemetrySamples.length > 2000) this.telemetrySamples.splice(0, this.telemetrySamples.length - 2000);
  }

  /** เรียกจาก poller ทุก tick — lock หมดอายุ + dock อัตโนมัติเมื่อแบตต่ำ */
  tick(): void {
    const now = Date.now();
    if (this.lock?.expiresAt && new Date(this.lock.expiresAt).getTime() < now) {
      this.releaseLockInternal('lock_expired');
    }
    // CON-05: กลับแท่นชาร์จอัตโนมัติเมื่อแบตต่ำกว่าเกณฑ์ (เฉพาะเมื่อว่าง)
    if (
      this.sim.batteryPct < config.dock.autoDockBatteryPct &&
      !this.activeJob() &&
      this.sim.mode === 'idle'
    ) {
      const dock = this.publishedPois().find((p) => p.isDock);
      if (dock) {
        this.sim.startDocking({ x: dock.x, y: dock.y, poiCode: dock.code });
      }
    }
  }

  releaseLockInternal(reason: string): void {
    if (!this.lock) return;
    this.lock = null;
    if (this.sim.mode === 'manual' || this.sim.mode === 'stopped') this.sim.releaseToIdle();
    this.addAudit(null, 'robot.lock.released', this.robot().code, { reason });
  }

  /** sim ถึงที่หมาย → อัปเดต job + ปลด lock auto */
  handleArrival(poiCode: string): void {
    const job = this.activeJob();
    const poi = this.publishedPois().find((p) => p.code === poiCode);
    if (job) {
      job.status = 'arrived';
      job.arrivedAt = new Date().toISOString();
      job.cancelReason = null;
      this.addJobEvent(job.id, 'arrived', { poi: poiCode });
    }
    if (this.lock?.mode === 'auto') this.lock = null;
    void poi;
  }
}

// ── singleton ─────────────────────────────────────────────────
let _world: World | null = null;

export function getWorld(): World {
  if (!_world) throw new Error('World not initialized — เรียก initWorld() ก่อน');
  return _world;
}

/**
 * สร้าง world + seed ข้อมูล
 * (ข้อมูลแผนที่เป็นสมมติตาม R-4 — ต้อง scan อาคารจริงก่อนใช้งานจริง)
 */
export async function initWorld(): Promise<World> {
  if (_world) return _world;
  const w = new World();
  const now = new Date().toISOString();

  const hash = async (pw: string) =>
    // Argon2id (NFR-04) — Algorithm.Argon2id = 2 (ใช้ค่าตัวเลขตรงเพื่อเข้ากันได้กับ tsx/esbuild)
    argon2.hash(pw, { memoryCost: 19456, timeCost: 2, outputLen: 32, algorithm: 2 }).then(String);

  const mkUser = (
    username: string,
    displayName: string,
    role: UserRole,
    password: string,
  ): Promise<UserRow> =>
    hash(password).then((passwordHash) => {
      const u: UserRow = {
        id: ++w.seq.user,
        username,
        displayName,
        email: null,
        passwordHash,
        role,
        isActive: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };
      w.users.push(u);
      return u;
    });

  await Promise.all([
    mkUser('admin', 'ผู้ดูแลระบบ', 'admin', 'admin123'),
    mkUser('operator', 'สมชาย เจ้าหน้าที่ต้อนรับ', 'operator', 'operator123'),
    mkUser('viewer', 'ผู้ดูสถานะ', 'viewer', 'viewer123'),
  ]);

  w.robots.push({
    id: 1,
    code: config.robot.code,
    model: 'SLAMTEC Hermes Pro Max',
    baseUrl: config.robot.baseUrl,
    isEnabled: true,
  });

  // แผนที่เวอร์ชัน 1 — เผยแพร่แล้ว (ข้อมูลสมมติ, R-4)
  const mapId = ++w.seq.map;
  w.maps.push({
    id: mapId,
    robotId: 1,
    version: 1,
    status: 'published',
    name: 'อาคารอาคะระ ชั้น 1',
    widthM: 30,
    heightM: 18,
    slamMapRef: null,
    createdBy: 1,
    publishedBy: 1,
    publishedAt: now,
    createdAt: now,
    rooms: [
      { id: 'lobby', x: 1, y: 1, w: 9, h: 16, nameTh: 'ล็อบบี้', nameEn: 'Lobby', kind: 'lobby' },
      { id: 'corridor', x: 10, y: 7, w: 9, h: 4, nameTh: 'โถงทางเดิน', nameEn: 'Corridor', kind: 'corridor' },
      { id: 'r101', x: 19, y: 1, w: 10, h: 4.5, nameTh: 'ห้อง 101', nameEn: 'Room 101', kind: 'room' },
      { id: 'r102', x: 19, y: 6.5, w: 10, h: 4.5, nameTh: 'ห้อง 102', nameEn: 'Room 102', kind: 'room' },
      { id: 'r103', x: 19, y: 11, w: 5, h: 6, nameTh: 'ห้อง 103', nameEn: 'Room 103', kind: 'room' },
      { id: 'svr', x: 24, y: 11, w: 5, h: 6, nameTh: 'ห้องเซิร์ฟเวอร์', nameEn: 'Server Room', kind: 'room' },
      { id: 'dock', x: 1.5, y: 13.5, w: 4, h: 3, nameTh: 'แท่นชาร์จ', nameEn: 'Charging Dock', kind: 'room' },
    ],
  });

  const mkPoi = (
    code: string,
    nameTh: string,
    nameEn: string,
    x: number,
    y: number,
    opts: Partial<Pick<PoiRow, 'isPublic' | 'isDock' | 'zone' | 'headingDeg'>> = {},
  ): void => {
    w.pois.push({
      id: ++w.seq.poi,
      mapId,
      code,
      nameTh,
      nameEn,
      x,
      y,
      headingDeg: opts.headingDeg ?? null,
      zone: opts.zone ?? null,
      isPublic: opts.isPublic ?? true,
      isDock: opts.isDock ?? false,
      sortOrder: w.seq.poi,
    });
  };

  mkPoi('RCPT', 'ห้องรับรอง', 'Reception', 4, 9, { zone: 'ล็อบบี้' });
  mkPoi('101', 'ห้อง 101', 'Room 101', 24, 3.2, { zone: 'ฝั่งซ้าย' });
  mkPoi('102', 'ห้อง 102', 'Room 102', 24, 8.7, { zone: 'ฝั่งซ้าย' });
  mkPoi('103', 'ห้อง 103', 'Room 103', 21.5, 14, { zone: 'ฝั่งซ้าย' });
  mkPoi('SVR', 'ห้องเซิร์ฟเวอร์', 'Server Room', 26.5, 14, { isPublic: false, zone: 'หวงห้าม' });
  mkPoi('DOCK', 'แท่นชาร์จ', 'Charging Dock', 3.5, 15, { isDock: true, zone: 'ล็อบบี้' });

  w.keepouts.push({
    id: ++w.seq.keepout,
    mapId,
    name: 'มุมงานช่าง',
    polygon: [
      [10.5, 15],
      [14, 15],
      [14, 17.5],
      [10.5, 17.5],
    ],
  });

  w.sim.onArrived = (poiCode: string) => w.handleArrival(poiCode);
  _world = w;
  return w;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
