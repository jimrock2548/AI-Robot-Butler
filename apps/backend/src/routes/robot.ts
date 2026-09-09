import { Router } from 'express';
import { lockRequestSchema, manualControlSchema } from '@hermes/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { buildRobotState } from '../services/robotService';
import { acquireLock, heartbeatLock, releaseLock } from '../services/lockService';
import { createJob, estop } from '../services/jobService';
import { getWorld } from '../db/memory';

export const robotRouter = Router();
robotRouter.use(requireAuth);

/** GET /api/robot/state — สถานะปัจจุบัน + linkStatus + capturedAt (CON-02) */
robotRouter.get('/state', (req, res, next) => {
  try {
    res.json(buildRobotState());
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/lock — ขอถือ lock, 409 ถ้ามีคนถืออยู่ (spec §6.2) */
robotRouter.post('/lock', requireRole('operator', 'admin'), (req, res, next) => {
  try {
    const { mode } = lockRequestSchema.parse(req.body);
    acquireLock(req.user!, mode, req.ip);
    res.json(buildRobotState().lock);
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/lock/heartbeat — ต่ออายุ 30 วินาที (ผู้ถือ lock) */
robotRouter.post('/lock/heartbeat', (req, res, next) => {
  try {
    heartbeatLock(req.user!, req.ip);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/robot/lock — ปล่อย หรือแย่ง (admin) */
robotRouter.delete('/lock', (req, res, next) => {
  try {
    releaseLock(req.user!, req.ip);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/manual — REST fallback ของ WebSocket (spec §8.2) */
robotRouter.post('/manual', (req, res, next) => {
  try {
    const w = getWorld();
    const lock = w.lock;
    if (!lock || lock.heldBy !== req.user!.id || lock.mode !== 'manual') {
      res.status(409).json({
        error: { code: 'no_manual_lock', message: 'ต้องถือ lock แบบ manual ก่อน' },
      });
      return;
    }
    const { vx, vyaw } = manualControlSchema.parse(req.body);
    w.sim.setManual(vx, vyaw);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/halt — หยุดขับเคลื่อน ไม่ยกเลิก job (CON-03) */
robotRouter.post('/halt', (req, res, next) => {
  try {
    const w = getWorld();
    if (w.lock?.heldBy !== req.user!.id) {
      res.status(409).json({ error: { code: 'no_manual_lock', message: 'ต้องถือ lock ก่อน' } });
      return;
    }
    w.sim.halt();
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/robot/estop — หยุดฉุกเฉิน
 * ใครก็ตามที่ล็อกอินแล้วกดได้ (spec §6.2 ข้อ 3) ไม่ต้องถือ lock
 * ยิงผ่าน REST ตรง ไม่ผ่าน WebSocket (NFR-07) — ยกเลิก job + ปลด lock ทันที
 */
robotRouter.post('/estop', (req, res, next) => {
  try {
    estop(req.user!, req.ip);
    res.json(buildRobotState());
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/dock — สั่งกลับแท่นชาร์จ (CON-05) */
robotRouter.post('/dock', requireRole('operator', 'admin'), (req, res, next) => {
  try {
    const w = getWorld();
    const dock = w.publishedPois().find((p) => p.isDock);
    if (!dock) {
      res.status(409).json({ error: { code: 'no_dock', message: 'ยังไม่มีจุดแท่นชาร์จบนแผนที่' } });
      return;
    }
    const job = createJob(dock.code, 'operator', { id: req.user!.id, name: req.user!.displayName, ip: req.ip });
    res.json(job);
  } catch (e) {
    next(e);
  }
});
