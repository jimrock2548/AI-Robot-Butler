import type { JobSource } from '@hermes/shared';
import { ApiError } from '../errors';
import { getWorld, type UserRow } from '../db/memory';
import { jobSummary } from './robotService';

/**
 * งานนำทาง — หนึ่ง job ต่อหนึ่งเวลา (spec §6.2 ข้อ 4)
 * ทุกงานบันทึก event log ห้ามลบ (CON-10)
 */

export interface JobRequester {
  id: number | null;
  name: string | null;
  ip?: string;
}

export function createJob(
  destPoiCode: string,
  source: JobSource,
  requester: JobRequester,
  opts: { requirePublic?: boolean } = {},
): ReturnType<typeof jobSummary> {
  const w = getWorld();
  const existing = w.activeJob();
  if (existing) {
    throw new ApiError(409, 'job_in_progress', 'มีงานนำทางกำลังทำงานอยู่แล้ว', { job: jobSummary(existing) });
  }
  const lock = w.lock;
  if (lock && lock.mode === 'manual' && lock.heldBy !== requester.id) {
    throw new ApiError(409, 'manual_lock_held', `หุ่นกำลังถูกควบคุมด้วยมือโดย ${w.userName(lock.heldBy)}`, {
      heldBy: w.userName(lock.heldBy),
    });
  }

  const map = w.findPublishedMap();
  if (!map) throw new ApiError(409, 'no_map', 'ยังไม่มีแผนที่ที่เผยแพร่');
  const poi = w.mapPois(map.id).find((p) => p.code === destPoiCode);
  if (!poi) throw new ApiError(404, 'unknown_poi', `ไม่พบปลายทาง ${destPoiCode} ในแผนที่เวอร์ชัน ${map.version}`);
  if (opts.requirePublic && !poi.isPublic) {
    throw new ApiError(403, 'restricted_poi', `ปลายทาง ${destPoiCode} ไม่เปิดให้ใช้งาน`);
  }

  const from = { x: w.sim.x, y: w.sim.y };
  const distance = Math.hypot(poi.x - from.x, poi.y - from.y);
  const now = new Date().toISOString();
  const job = {
    id: ++w.seq.job,
    ref: w.nextJobRef(),
    robotId: w.robot().id,
    mapVersion: map.version,
    destPoiCode: poi.code,
    destName: poi.nameTh,
    source,
    requestedBy: requester.id,
    status: 'navigating' as const,
    distanceM: Math.round(distance * 100) / 100,
    departedAt: now,
    arrivedAt: null,
    cancelReason: null,
    createdAt: now,
  };
  w.jobs.push(job);
  w.addJobEvent(job.id, 'requested', { source, dest: poi.code, requestedBy: requester.name });
  w.addJobEvent(job.id, 'accepted', { distanceM: job.distanceM });

  if (poi.isDock) {
    w.sim.startDocking({ x: poi.x, y: poi.y, poiCode: poi.code });
  } else {
    w.sim.startNavigation({ x: poi.x, y: poi.y, poiCode: poi.code });
  }
  // job ถือ lock แบบ auto (ไม่หมดอายุ) — กันคนแย่งคุมระหว่างนำทาง
  w.lock = {
    robotId: w.robot().id,
    heldBy: requester.id,
    mode: 'auto',
    acquiredAt: now,
    expiresAt: null,
  };
  w.addAudit(requester.id, 'job.create', job.ref, { dest: poi.code, source }, requester.ip);
  return jobSummary(job);
}

export function cancelJob(
  jobId: number | undefined,
  canceller: { id: number | null; displayName: string },
  reason?: string,
  ip?: string,
): ReturnType<typeof jobSummary> {
  const w = getWorld();
  const job = w.jobs.find((j) => j.id === jobId);
  if (!job) throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');
  if (job.status !== 'queued' && job.status !== 'navigating') {
    throw new ApiError(409, 'job_not_active', 'งานนี้ไม่ได้อยู่ระหว่างทำงาน');
  }
  job.status = 'cancelled';
  job.cancelReason = reason ?? 'ยกเลิกโดยผู้ควบคุม';
  w.addJobEvent(job.id, 'cancelled', { reason: job.cancelReason, by: canceller.displayName });
  w.sim.releaseToIdle();
  if (w.lock?.mode === 'auto') w.lock = null;
  w.addAudit(canceller.id, 'job.cancel', job.ref, { reason: job.cancelReason }, ip);
  return jobSummary(job);
}

/** E-Stop — ข้ามทุกกฎ: ไม่ต้องถือ lock, ยกเลิก job + ปลด lock ทันที (spec §6.2 ข้อ 3) */
export function estop(user: UserRow, ip?: string): void {
  const w = getWorld();
  const job = w.activeJob();
  if (job) {
    job.status = 'stopped';
    job.cancelReason = 'estop';
    w.addJobEvent(job.id, 'estop', { by: user.displayName });
  }
  w.lock = null;
  w.sim.estop();
  w.addAudit(user.id, 'robot.estop', w.robot().code, { hadJob: job?.ref ?? null }, ip);
}
