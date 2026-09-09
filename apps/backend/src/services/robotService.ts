import type { JobSummary, RobotState, Telemetry } from '@hermes/shared';
import { config } from '../config';
import { getWorld, type JobRow, type UserRow } from '../db/memory';

/**
 * ประกอบ RobotState — แหล่งความจริงเดียวของสถานะหุ่น (spec §6, §5.3)
 */

export function buildTelemetry(): Telemetry | null {
  const w = getWorld();
  const s = w.sim;
  const age = Date.now() - s.lastTelemetryAt;
  if (age > config.telemetry.deadMs) return null;
  return {
    batteryPct: Math.round(s.batteryPct * 10) / 10,
    x: Math.round(s.x * 100) / 100,
    y: Math.round(s.y * 100) / 100,
    headingDeg: Math.round(s.headingDeg),
    speedMps: Math.round(s.speed * 100) / 100,
    wifiDbm: s.wifiDbm,
    cpuPct: s.cpuPct,
    uptimeSec: Math.round(s.uptimeSec),
    lidar: s.lidar,
    capturedAt: new Date(s.lastTelemetryAt).toISOString(),
  };
}

export function linkStatus(): 'ok' | 'stale' | 'dead' {
  const age = Date.now() - getWorld().sim.lastTelemetryAt;
  if (age < config.telemetry.staleMs) return 'ok';
  if (age < config.telemetry.deadMs) return 'stale';
  return 'dead';
}

export function buildRobotState(): RobotState {
  const w = getWorld();
  const lock = w.lock;
  const job = w.activeJob();
  return {
    robotCode: w.robot().code,
    linkStatus: linkStatus(),
    lastSeenAt: new Date(w.sim.lastTelemetryAt).toISOString(),
    mode: w.sim.mode,
    telemetry: buildTelemetry(),
    lock: {
      heldBy: lock?.heldBy ?? null,
      userName: lock ? w.userName(lock.heldBy) : null,
      mode: lock?.mode ?? null,
      expiresAt: lock?.expiresAt ?? null,
    },
    currentJob: job ? jobSummary(job) : null,
    simulated: true,
  };
}

/** สรุป job พร้อม progress/remaining/ETA — คำนวณครั้งเดียว (หลักข้อ 6, spec §12) */
export function jobSummary(job: JobRow): JobSummary {
  const w = getWorld();
  const active = job.status === 'queued' || job.status === 'navigating';
  let remainingM: number | null = null;
  let etaSec: number | null = null;
  let progress = 0;
  if (active) {
    const d = w.sim.distanceToTarget();
    remainingM = d === null ? null : Math.max(0, Math.round(d * 100) / 100);
    etaSec = remainingM === null ? null : Math.max(0, Math.ceil(remainingM / 0.6));
    progress =
      job.distanceM && job.distanceM > 0 && remainingM !== null
        ? Math.min(1, Math.max(0, 1 - remainingM / job.distanceM))
        : 0;
  } else if (job.status === 'arrived') {
    progress = 1;
    remainingM = 0;
    etaSec = 0;
  }
  return {
    id: job.id,
    ref: job.ref,
    destPoiCode: job.destPoiCode,
    destName: job.destName,
    source: job.source,
    status: job.status,
    mapVersion: job.mapVersion,
    distanceM: job.distanceM,
    remainingM,
    etaSec,
    progress: Math.round(progress * 1000) / 1000,
    requestedByName: w.userName(job.requestedBy),
    createdAt: job.createdAt,
  };
}

export function userPublic(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}
