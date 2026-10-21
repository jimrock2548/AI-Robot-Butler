import { Router } from 'express';
import { lockRequestSchema, manualControlSchema } from '@hermes/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { buildRobotState, requireRobotLink } from '../services/robotService';
import { acquireLock, heartbeatLock, releaseLock } from '../services/lockService';
import { createJob, estop } from '../services/jobService';
import { getWorld } from '../db/memory';
import { hermes, pulseHermesManual } from '../hermes/driver';
import { ApiError } from '../errors';
import { getLiveMap } from '../services/liveMapService';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { beginMaintenance, verifyHardwareIdle } from '../services/robotActivity';
import { requireIdleRobot } from '../services/robotControlService';

const coordinateSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const robotRouter = Router();
robotRouter.use(requireAuth);

const poiInput = z.object({ name: z.string().trim().min(1).max(80), aliases: z.array(z.string().trim().min(1).max(80)).max(20).optional(), x: z.number().finite(), y: z.number().finite(), headingDeg: z.number().finite().min(-360).max(360) });
let poiWriteBusy = false;
function requirePoiEditor() {
  if (!hermes) throw new ApiError(409, 'simulated_robot', 'ใช้กับแผนที่บนหุ่นจริงเท่านั้น');
  if (poiWriteBusy) throw new ApiError(409, 'poi_busy', 'กำลังบันทึก POI กรุณารอสักครู่');
  if (getWorld().activeJob() || getWorld().lock) throw new ApiError(409, 'robot_busy', 'สิ้นสุดงานและปล่อยสิทธิ์ควบคุมก่อนแก้ POI');
  return hermes;
}
for (const method of ['post', 'put'] as const) {
  robotRouter[method](method === 'post' ? '/pois' : '/pois/:id', requireRole('operator', 'admin'), async (req, res, next) => {
    try {
      const input = poiInput.parse(req.body);
      const id = method === 'post' ? randomUUID() : z.string().uuid().parse(req.params.id);
      const client = requirePoiEditor();
      const releaseMaintenance = beginMaintenance(requireIdleRobot);
      poiWriteBusy = true;
      try {
        await verifyHardwareIdle(); requireIdleRobot();
        const map = await getLiveMap(true);
        if (map.mappingEnabled !== false) throw new ApiError(409, 'mapping_active', 'บันทึกแผนที่และปิดโหมดสร้างแผนที่ก่อนแก้จุด POI');
        if (input.x < map.x || input.y < map.y || input.x >= map.x + map.width * map.resolution || input.y >= map.y + map.height * map.resolution) throw new ApiError(422, 'outside_map', 'จุด POI อยู่นอกแผนที่');
        if (getWorld().activeJob() || getWorld().lock) throw new ApiError(409, 'robot_busy', 'หุ่นเริ่มงานแล้ว กรุณาลองใหม่เมื่อสิ้นสุดงาน');
        const poi = await client.savePoi({ id, pose: { x: input.x, y: input.y, yaw: input.headingDeg * Math.PI / 180 }, metadata: { display_name: input.name,
          ...(input.aliases ? { aliases: [...new Set(input.aliases)] } : {}), ...(method === 'post' ? { type: 'poi' } : {}) } }, method === 'put');
        getWorld().addAudit(req.user!.id, `robot.poi.${method === 'post' ? 'create' : 'update'}`, id, { name: input.name }, req.ip);
        // A map refresh is independent of the verified POI write. The shared poller refreshes viewers.
        res.status(method === 'post' ? 201 : 200).json(poi);
      } finally { poiWriteBusy = false; releaseMaintenance(); }
    } catch (error) { next(error instanceof ApiError || error instanceof z.ZodError ? error : new ApiError(503, 'poi_write_failed', `บันทึก POI ไม่สำเร็จ: ${String(error)}`)); }
  });
}
robotRouter.delete('/pois/:id', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const client = requirePoiEditor();
    const releaseMaintenance = beginMaintenance(requireIdleRobot);
    poiWriteBusy = true;
    try {
      await verifyHardwareIdle(); requireIdleRobot();
      const map = await getLiveMap(true);
      if (map.mappingEnabled !== false) throw new ApiError(409, 'mapping_active', 'ปิดโหมดสร้างแผนที่ก่อนลบ POI');
      await client.deletePoi(id);
      getWorld().addAudit(req.user!.id, 'robot.poi.delete', id, null, req.ip);
      res.status(204).end();
    } finally { poiWriteBusy = false; releaseMaintenance(); }
  } catch (error) { next(error); }
});

/** Read the map already loaded on the robot; never imports or publishes navigation targets. */
robotRouter.get('/live-map', async (_req, res, next) => {
  try {
    if (!hermes) throw new ApiError(409, 'simulated_robot', 'แผนที่นี้อ่านได้เมื่อเชื่อมต่อหุ่นจริง');
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getLiveMap());
  } catch (error) { next(error); }
});

robotRouter.post('/navigate', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    if (!hermes) throw new ApiError(409, 'simulated_robot', 'เลือกพิกัดได้เฉพาะหุ่นจริง');
    const { x, y } = coordinateSchema.parse(req.body);
    res.status(201).json(await createJob('XY', 'operator', { id: req.user!.id, name: req.user!.displayName, ip: req.ip }, {
      target: { x, y, headingDeg: null, isDock: false, code: 'XY', nameTh: `พิกัด (${x.toFixed(2)}, ${y.toFixed(2)})`, isPublic: false },
    }));
  } catch (error) { next(error); }
});

robotRouter.post('/estop/reset', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const w = getWorld();
    if (w.sim.mode !== 'stopped') throw new ApiError(409, 'not_stopped', 'หุ่นไม่ได้อยู่ในสถานะหยุดฉุกเฉิน');
    if (hermes) await hermes.clearEmergencyStop();
    w.sim.releaseToIdle();
    w.addAudit(req.user!.id, 'robot.estop.reset', w.robot().code, null, req.ip);
    res.json(buildRobotState());
  } catch (error) { next(error); }
});

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
robotRouter.post('/manual', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    requireRobotLink();
    const w = getWorld();
    const lock = w.lock;
    if (!lock || lock.heldBy !== req.user!.id || lock.mode !== 'manual') {
      res.status(409).json({
        error: { code: 'no_manual_lock', message: 'ต้องถือ lock แบบ manual ก่อน' },
      });
      return;
    }
    const { vx, vyaw } = manualControlSchema.parse(req.body);
    if (hermes) await pulseHermesManual(vx, vyaw, req.user!.id);
    else w.sim.setManual(vx, vyaw);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/halt — หยุดขับเคลื่อน ไม่ยกเลิก job (CON-03) */
robotRouter.post('/halt', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    requireRobotLink();
    const w = getWorld();
    if (w.lock?.heldBy !== req.user!.id || w.lock.mode !== 'manual') {
      res.status(409).json({ error: { code: 'no_manual_lock', message: 'ต้องถือ lock ก่อน' } });
      return;
    }
    if (hermes) await pulseHermesManual(0, 0);
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
robotRouter.post('/estop', async (req, res, next) => {
  try {
    await estop(req.user!, req.ip);
    res.json(buildRobotState());
  } catch (e) {
    next(e);
  }
});

/** POST /api/robot/dock — สั่งกลับแท่นชาร์จ (CON-05) */
robotRouter.post('/dock', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const w = getWorld();
    if (hermes) {
      requireRobotLink();
      const map = await getLiveMap();
      if (!map.home) throw new ApiError(409, 'no_dock', 'หุ่นยังไม่มีตำแหน่งแท่นชาร์จ');
      const job = await createJob('DOCK', 'operator', { id: req.user!.id, name: req.user!.displayName, ip: req.ip }, {
        target: { x: map.home.x, y: map.home.y, headingDeg: map.home.yaw * 180 / Math.PI,
          isDock: true, code: 'DOCK', nameTh: 'แท่นชาร์จบนแผนที่หุ่น', isPublic: false },
      });
      res.json(job);
      return;
    }
    const dock = w.publishedPois().find((p) => p.isDock);
    if (!dock) {
      res.status(409).json({ error: { code: 'no_dock', message: 'ยังไม่มีจุดแท่นชาร์จบนแผนที่' } });
      return;
    }
    const job = await createJob(dock.code, 'operator', { id: req.user!.id, name: req.user!.displayName, ip: req.ip });
    res.json(job);
  } catch (e) {
    next(e);
  }
});
