/**
 * Types ที่ frontend/backend แชร์กัน — ต้องตรงกับ schema ใน spec.md §7 และ §8
 */

export type UserRole = 'viewer' | 'operator' | 'admin';
export type LinkStatus = 'ok' | 'stale' | 'dead';
export type RobotMode = 'idle' | 'manual' | 'navigating' | 'docking' | 'stopped';
export type JobStatus = 'queued' | 'navigating' | 'arrived' | 'cancelled' | 'failed' | 'stopped';
export type JobSource = 'operator' | 'kiosk_touch' | 'kiosk_voice' | 'auto';
export type MapStatus = 'draft' | 'published' | 'archived';
export type Lang = 'th' | 'en';

export interface Telemetry {
  batteryPct: number;
  /** เมตร ในกรอบพิกัดของ SLAM */
  x: number;
  y: number;
  headingDeg: number;
  speedMps: number | null;
  wifiDbm: number | null;
  cpuPct: number | null;
  uptimeSec: number | null;
  lidar: 'ok' | 'warn' | 'fault' | null;
  /** เวลา Backend รับค่าชุดนี้; REST API ชุดนี้ไม่ได้ส่ง timestamp จากหุ่น */
  capturedAt: string;
}

export interface LockInfo {
  heldBy: number | null;
  userName: string | null;
  mode: 'manual' | 'auto' | null;
  expiresAt: string | null;
}

export interface JobSummary {
  id: number;
  ref: string;
  destPoiCode: string;
  destName: string;
  source: JobSource;
  status: JobStatus;
  mapVersion: number;
  distanceM: number | null;
  remainingM: number | null;
  etaSec: number | null;
  /** 0..1 */
  progress: number;
  requestedByName: string | null;
  createdAt: string;
}

export interface JobEvent {
  id: number;
  at: string;
  kind: string;
  detail?: Record<string, unknown> | null;
}

export interface JobDetail extends JobSummary {
  events: JobEvent[];
  cancelReason?: string | null;
  departedAt?: string | null;
  arrivedAt?: string | null;
}

export interface Poi {
  code: string;
  nameTh: string;
  nameEn: string;
  x: number;
  y: number;
  headingDeg: number | null;
  zone?: string | null;
  isPublic: boolean;
  isDock: boolean;
  sortOrder: number;
}

export interface RoomShape {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nameTh?: string;
  nameEn?: string;
  kind?: 'lobby' | 'room' | 'corridor';
}

export interface KeepoutZone {
  id: number;
  name: string;
  polygon: [number, number][];
}

export interface MapVersionSummary {
  id: number;
  version: number;
  status: MapStatus;
  name: string;
  widthM: number;
  heightM: number;
  publishedBy?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

export interface MapFull extends MapVersionSummary {
  rooms: RoomShape[];
  pois: Poi[];
  keepouts: KeepoutZone[];
}

export interface RobotState {
  robotCode: string;
  linkStatus: LinkStatus;
  lastSeenAt: string | null;
  mode: RobotMode;
  /** null เมื่อ link dead */
  telemetry: Telemetry | null;
  lock: LockInfo;
  currentJob: JobSummary | null;
  /** true เมื่อ backend ใช้ข้อมูลจำลอง (ยังไม่ได้ต่อ Hermes จริง) */
  simulated: boolean;
  /** Connected-device preview using local fixtures; never accesses real hardware. */
  mockConnected?: boolean;
  /** False when real hardware is connected for observation only. */
  commandsEnabled: boolean;
  motionLimits: { linearMps: number; angularRps: number } | null;
}

export interface RobotPoi {
  id: string;
  pose?: { x: number; y: number; yaw: number };
  metadata?: Record<string, unknown>;
}

export interface RobotWall {
  id: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface RobotMapArchive {
  id: string;
  name: string;
  byteLength: number;
  sha256: string;
  createdAt: string;
  source: 'robot' | 'upload' | 'backup';
}

export interface LiveRobotMap {
  x: number;
  y: number;
  width: number;
  height: number;
  resolution: number;
  cellsBase64: string;
  localizationQuality: number | null;
  home: { x: number; y: number; yaw: number } | null;
  poiCount: number | null;
  pois?: RobotPoi[] | null;
  walls?: RobotWall[] | null;
  laser?: { pose: { x: number; y: number; yaw: number }; laser_points: { distance: number; angle: number; valid: boolean }[] } | null;
  modelName: string | null;
  softwareVersion: string | null;
  dockingStatus: string | null;
  mappingEnabled: boolean | null;
  capturedAt: string;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AiRejection {
  id: number;
  at: string;
  transcript: string;
  reason: string;
  detail?: Record<string, unknown> | null;
}

export interface AiConversation {
  id: number;
  at: string;
  lang: string;
  transcript: string;
  intent: string | null;
  confidence: number | null;
  jobId: number | null;
  latencyMs: number | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  userName: string | null;
  action: string;
  target: string | null;
  detail?: Record<string, unknown> | null;
  ip: string | null;
}

export interface KioskDestination {
  code: string;
  nameTh: string;
  nameEn: string;
  isDock: boolean;
}

export interface KioskSession {
  job: JobSummary;
  lang: Lang;
  map: {
    widthM: number;
    heightM: number;
    rooms: RoomShape[];
    pois: Poi[];
    keepouts: KeepoutZone[];
  } | null;
  robot: { x: number; y: number; headingDeg: number } | null;
}
