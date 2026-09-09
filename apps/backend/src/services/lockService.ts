import { config } from '../config';
import { ApiError } from '../errors';
import { getWorld, type UserRow } from '../db/memory';
import { jobSummary } from './robotService';

/**
 * Control lock — บังคับฝั่ง server ทั้งหมด (spec §6.2)
 * กฎ:
 *  - MANUAL กับ NAVIGATING ห้ามเกิดพร้อมกัน
 *  - TTL 30 วิ heartbeat ทุก 10 วิ
 *  - admin แย่ง lock ได้ (ยืนยัน + audit)
 *  - E-Stop ปลด lock ทันที
 */

export function acquireLock(user: UserRow, mode: 'manual' | 'auto', ip?: string): void {
  const w = getWorld();
  const active = w.activeJob();

  if (mode === 'manual' && active) {
    throw new ApiError(409, 'job_in_progress', 'หุ่นกำลังทำนำทางอยู่ ไม่สามารถควบคุมแบบมือได้', {
      job: jobSummary(active),
    });
  }

  const lock = w.lock;
  if (lock && lock.heldBy !== null && lock.heldBy !== user.id) {
    if (user.role !== 'admin') {
      throw new ApiError(
        409,
        'lock_held',
        `หุ่นกำลังถูกควบคุมโดย ${w.userName(lock.heldBy)}`,
        { heldBy: w.userName(lock.heldBy) },
      );
    }
    w.addAudit(user.id, 'robot.lock.preempt', w.robot().code, {
      preemptedFrom: w.userName(lock.heldBy),
      mode,
    }, ip);
  }

  const now = Date.now();
  w.lock = {
    robotId: w.robot().id,
    heldBy: user.id,
    mode,
    acquiredAt: new Date(now).toISOString(),
    // manual lock หมดอายุถ้าหยุด heartbeat — auto lock (ของ job) ไม่หมดอายุ
    expiresAt: mode === 'manual' ? new Date(now + config.lock.ttlMs).toISOString() : null,
  };

  if (mode === 'manual') {
    w.sim.releaseToIdle();
    w.sim.mode = 'manual';
  }
  w.addAudit(user.id, 'robot.lock.acquire', w.robot().code, { mode }, ip);
}

export function heartbeatLock(user: UserRow, ip?: string): void {
  const w = getWorld();
  const lock = w.lock;
  if (!lock) throw new ApiError(409, 'no_lock', 'ยังไม่มีการถือ lock');
  if (lock.heldBy !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'forbidden', 'คุณไม่ได้ถือ lock นี้');
  }
  lock.expiresAt = new Date(Date.now() + config.lock.ttlMs).toISOString();
  void ip;
}

export function releaseLock(user: UserRow, ip?: string): void {
  const w = getWorld();
  const lock = w.lock;
  if (!lock) return;
  if (lock.heldBy !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'forbidden', 'คุณไม่ได้ถือ lock นี้');
  }
  w.releaseLockInternal(user.role === 'admin' && lock.heldBy !== user.id ? 'released_by_admin' : 'released');
}
