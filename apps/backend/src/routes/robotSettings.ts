import { Router, raw } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { hermes } from '../hermes/driver';
import { getWorld } from '../db/memory';
import { getLiveMap } from '../services/liveMapService';
import { applySpeed, applyOperatingMode, readControlSettings, storeArchive, captureMap, archiveBytes, activateMap,
  confirmPose, writeWall, configureStandby, returnToStandby, listMapArchives, requireIdleRobot, startNewMap, verifyNewMapDock, readArchiveProtection, deleteMapArchive } from '../services/robotControlService';
import { withMaintenance } from '../services/robotActivity';
import { ApiError } from '../errors';

export const robotSettingsRouter = Router();
robotSettingsRouter.use(requireAuth);
const nameInput = z.string().trim().min(1).max(100);
const uuid = z.string().uuid();
function audit(userId: number, action: string, detail: Record<string, unknown>, ip?: string) {
  getWorld().addAudit(userId, 'robot.' + action, getWorld().robot().code, detail, ip);
}
robotSettingsRouter.get('/settings', async (_req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await readControlSettings()); } catch (e) { next(e); }
});
robotSettingsRouter.put('/speed', requireRole('operator', 'admin'), async (req, res, next) => {
  try { const result = await applySpeed(req.body); audit(req.user!.id, 'speed.update', result, req.ip); res.json(result); } catch (e) { next(e); }
});
robotSettingsRouter.put('/operating-mode', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const { mode } = z.object({ mode: z.enum(['normal', 'exploration']) }).strict().parse(req.body);
    const result = await applyOperatingMode(mode); audit(req.user!.id, 'mode.update', result, req.ip); res.json(result);
  } catch (e) { next(e); }
});
robotSettingsRouter.get('/map-archives', async (_req, res, next) => {
  try { res.json(await listMapArchives()); } catch (e) { next(e); }
});
robotSettingsRouter.get('/map-archives/protection', async (_req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json(await readArchiveProtection()); } catch (e) { next(e); }
});
robotSettingsRouter.delete('/map-archives/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const item = await deleteMapArchive(uuid.parse(req.params.id));
    audit(req.user!.id, 'map.archive.delete', { id: item.id, name: item.name, sha256: item.sha256 }, req.ip);
    res.status(204).end();
  } catch (e) { next(e); }
});
robotSettingsRouter.post('/map/clear', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await startNewMap(req.body, { id: req.user!.id, ip: req.ip });
    audit(req.user!.id, 'map.clear.complete', result, req.ip); res.json(result);
  } catch (e) { next(e); }
});
robotSettingsRouter.post('/dock/verify', requireRole('operator', 'admin'), async (req, res, next) => {
  try { const result = await verifyNewMapDock(req.body); audit(req.user!.id, 'dock.verify', result, req.ip); res.json(result); } catch (e) { next(e); }
});
robotSettingsRouter.post('/map-archives/capture', requireRole('admin'), async (req, res, next) => {
  try {
    const name = nameInput.parse(req.body?.name);
    const result = await withMaintenance(requireIdleRobot, () => captureMap(name));
    audit(req.user!.id, 'map.capture', { id: result.id, sha256: result.sha256 }, req.ip); res.status(201).json(result);
  } catch (e) { next(e); }
});
robotSettingsRouter.post('/map-archives/upload', requireRole('admin'), raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res, next) => {
  try {
    const name = nameInput.parse(req.query.name);
    if (!Buffer.isBuffer(req.body)) throw new ApiError(415, 'binary_required', 'ส่งไฟล์ STCM แบบ application/octet-stream');
    const result = await storeArchive(name, req.body, 'upload');
    audit(req.user!.id, 'map.upload-to-library', { id: result.id, sha256: result.sha256 }, req.ip); res.status(201).json(result);
  } catch (e) { next(e); }
});
robotSettingsRouter.get('/map-archives/:id/download', async (req, res, next) => {
  try {
    const { item, bytes } = await archiveBytes(uuid.parse(req.params.id));
    res.setHeader('Content-Disposition', `attachment; filename="map-${item.id}.stcm"`);
    res.type('application/octet-stream').send(bytes);
  } catch (e) { next(e); }
});
robotSettingsRouter.post('/map-archives/:id/activate', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await activateMap(uuid.parse(req.params.id));
    audit(req.user!.id, 'map.activate', result, req.ip); res.json(result);
  } catch (e) { next(e); }
});
robotSettingsRouter.put('/localization', requireRole('operator', 'admin'), async (req, res, next) => {
  try { const result = await confirmPose(req.body); audit(req.user!.id, 'localization.set', result, req.ip); res.json(result); } catch (e) { next(e); }
});
robotSettingsRouter.get('/walls', async (_req, res, next) => {
  try {
    if (!hermes) throw new ApiError(409, 'robot_required', 'ต้องเชื่อมต่อหุ่นจริง');
    res.json(await hermes.listWalls());
  } catch (e) { next(e); }
});
for (const method of ['post', 'put'] as const) robotSettingsRouter[method](method === 'post' ? '/walls' : '/walls/:id', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const id = method === 'put' ? z.coerce.number().int().nonnegative().parse(req.params.id) : undefined;
    const result = await writeWall(req.body, id);
    audit(req.user!.id, 'wall.' + method, { ...result }, req.ip); res.status(method === 'post' ? 201 : 200).json(result);
  } catch (e) { next(e); }
});
robotSettingsRouter.delete('/walls/:id', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const id = z.coerce.number().int().nonnegative().parse(req.params.id);
    await withMaintenance(requireIdleRobot, async () => {
      const map = await getLiveMap(true);
      if (map.mappingEnabled !== false) throw new ApiError(409, 'mapping_active', 'ปิดโหมดสร้างแผนที่ก่อนลบกำแพง');
      await hermes!.deleteWall(id);
    });
    audit(req.user!.id, 'wall.delete', { id }, req.ip); res.status(204).end();
  } catch (e) { next(e); }
});
robotSettingsRouter.put('/standby', requireRole('operator', 'admin'), async (req, res, next) => {
  try { const result = await configureStandby(req.body); audit(req.user!.id, 'standby.configure', result, req.ip); res.json(result); } catch (e) { next(e); }
});
robotSettingsRouter.post('/standby/return', requireRole('operator', 'admin'), async (req, res, next) => {
  try { res.status(201).json(await returnToStandby({ id: req.user!.id, name: req.user!.displayName, ip: req.ip })); } catch (e) { next(e); }
});
