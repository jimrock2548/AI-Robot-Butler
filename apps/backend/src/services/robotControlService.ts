import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LiveRobotMap, RobotMapArchive, RobotWall } from '@hermes/shared';
import { hermes, invalidateMotionLimits, setArrivalHandler } from '../hermes/driver';
import { getWorld } from '../db/memory';
import { ApiError } from '../errors';
import { getDocument, listDocuments, putDocument } from './documentStore';
import { getMotionSettings, speedBounds, updateMotionSettings } from './motionSettings';
import { requireRobotLink, linkStatus } from './robotService';
import { setLocalizationRequired, withMaintenance, setHardwareIdleCheck, setDockVerificationRequired } from './robotActivity';
import { invalidateLiveMap } from './liveMapService';
import { createJob } from './jobService';
import { config } from '../config';

export const speedInput = z.object({ linearMps: z.number().finite().min(speedBounds.minLinearMps).max(speedBounds.maxLinearMps),
  angularRps: z.number().finite().min(speedBounds.minAngularRps).max(speedBounds.maxAngularRps) }).strict();
const point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const wallInput = z.object({ start: point, end: point }).strict().refine(w => Math.hypot(w.start.x - w.end.x, w.start.y - w.end.y) >= 0.05, 'กำแพงต้องยาวอย่างน้อย 5 ซม.');
export const poseInput = point.extend({ headingDeg: z.number().finite().min(-360).max(360) });
export const standbyInput = z.object({ poiId: z.string().uuid().nullable(), returnPolicy: z.enum(['manual', 'after_job']) }).strict()
  .refine(v => v.returnPolicy === 'manual' || v.poiId !== null, 'กำหนดจุดประจำก่อนเปิดกลับอัตโนมัติ');
type Binding = { archiveId: string | null; needsLocalization: boolean; dockNeedsVerification?: boolean; resetBackupId?: string };
type Standby = z.infer<typeof standbyInput> & { mapSignature: string; updatedAt: string };
let pendingReturn: number | null = null;
let standbyBusy = false;

export function requireIdleRobot() {
  if (!hermes) throw new ApiError(409, 'robot_required', 'ต้องเชื่อมต่อหุ่นจริง');
  requireRobotLink();
  if (linkStatus() !== 'ok') throw new ApiError(503, 'robot_stale', 'รอข้อมูลหุ่นสดก่อนตั้งค่า');
  const w = getWorld();
  if (w.activeJob() || w.lock || w.sim.mode !== 'idle') throw new ApiError(409, 'robot_busy', 'สิ้นสุดงานและปล่อยสิทธิ์ควบคุมก่อนตั้งค่าหุ่น');
}
export function mapSignature(map: LiveRobotMap) {
  return createHash('sha256').update(JSON.stringify([map.x, map.y, map.width, map.height, map.resolution])).update(map.cellsBase64).digest('hex');
}
function insideMap(map: LiveRobotMap, p: { x: number; y: number }) {
  if (p.x < map.x || p.y < map.y || p.x >= map.x + map.width * map.resolution || p.y >= map.y + map.height * map.resolution) throw new ApiError(422, 'outside_map', 'ตำแหน่งอยู่นอกแผนที่');
}
export async function readControlSettings() {
  if (!hermes) throw new ApiError(409, 'robot_required', 'ต้องเชื่อมต่อหุ่นจริง');
  const [actual, mode, binding, standby] = await Promise.all([hermes.getMotionLimits(), hermes.getOperatingMode(),
    getDocument<Binding>('robot-active-map', 'robot-binding'), getDocument<Standby>('robot-standby', 'robot-standby')]);
  return { desired: getMotionSettings(), actual, bounds: speedBounds, ...mode, binding, standby };
}
export async function applySpeed(raw: unknown) {
  const value = speedInput.parse(raw);
  return withMaintenance(requireIdleRobot, async () => {
    try { await hermes!.setMotionLimits(value.linearMps, value.angularRps); }
    catch (error) { throw new ApiError(503, 'speed_unconfirmed', `หุ่นไม่ยืนยันความเร็วที่ตั้ง: ${String(error)}`); }
    // Runtime follows confirmed hardware even if saving the preference fails.
    updateMotionSettings(value); invalidateMotionLimits();
    await putDocument('robot-motion-settings', 'robot-settings', value);
    return { ...value, verified: true };
  });
}
export async function applyOperatingMode(mode: 'normal' | 'exploration') {
  return withMaintenance(requireIdleRobot, async () => {
    pendingReturn = null;
    if (mode === 'exploration') await captureMap('สำรองก่อนเปิดสร้างแผนที่', 'backup');
    return hermes!.setOperatingMode(mode);
  });
}

export const clearMapInput = z.object({ confirmation: z.literal('CLEAR MAP') }).strict();
export async function startNewMap(raw: unknown, actor: { id: number | null; ip?: string } = { id: null }) {
  clearMapInput.parse(raw);
  return withMaintenance(requireIdleRobot, async () => {
    // Do not freeze mapping or remove anything until the complete STCM backup is durable and readable.
    const backup = await captureMap('สำรองก่อนล้างแผนที่ · ' + new Date().toISOString(), 'backup');
    await archiveBytes(backup.id);
    const binding: Binding = { archiveId: null, needsLocalization: true, dockNeedsVerification: true, resetBackupId: backup.id };
    await putDocument('robot-active-map', 'robot-binding', binding);
    setLocalizationRequired(true); setDockVerificationRequired(true); pendingReturn = null;
    await putDocument('robot-standby', 'robot-standby', { poiId: null, returnPolicy: 'manual', mapSignature: '', updatedAt: new Date().toISOString() });
    getWorld().addAudit(actor.id, 'robot.map.clear.begin', backup.id, { backupId: backup.id }, actor.ip);
    invalidateLiveMap();
    try {
      await hermes!.setOperatingMode('normal');
      await hermes!.clearMap();
      // Firmware versions may retain artifacts when only the SLAM grid is cleared.
      const pois = await hermes!.listPois(), walls = await hermes!.listWalls();
      for (const poi of pois) await hermes!.deletePoi(poi.id);
      for (const wall of walls) await hermes!.deleteWall(wall.id);
      if ((await hermes!.listPois()).length || (await hermes!.listWalls()).length) throw new Error('Old map artifacts remain');
      await hermes!.setOperatingMode('exploration');
      invalidateLiveMap();
      return { cleared: true, mappingEnabled: true, backupId: backup.id, needsLocalization: true, dockNeedsVerification: true };
    } catch (error) {
      let mappingDisabled = false;
      try { await hermes!.setOperatingMode('normal'); mappingDisabled = true; } catch { /* Keep the durable navigation interlock either way. */ }
      invalidateLiveMap();
      getWorld().addAudit(actor.id, 'robot.map.clear.failed', backup.id, { error: String(error), mappingDisabled }, actor.ip);
      throw new ApiError(503, 'map_clear_failed', `ล้างแผนที่ไม่สำเร็จ: ${String(error)} · ไฟล์สำรอง ${backup.id}`, { backupId: backup.id, mappingDisabled });
    }
  });
}

export async function verifyNewMapDock(raw: unknown) {
  z.object({ confirmation: z.literal('CONFIRM DOCK') }).strict().parse(raw);
  return withMaintenance(requireIdleRobot, async () => {
    const binding = await getDocument<Binding>('robot-active-map', 'robot-binding');
    if (!binding?.dockNeedsVerification) throw new ApiError(409, 'dock_already_verified', 'ไม่มีการยืนยันแท่นชาร์จที่ค้างอยู่');
    const map = await hermes!.inspectMap();
    if (binding.needsLocalization || map.mappingEnabled !== false || (map.localizationQuality ?? 0) < config.robot.minLocalizationQuality || !map.home) {
      throw new ApiError(409, 'dock_not_ready', 'ปิดโหมดสร้างแผนที่ ระบุตำแหน่ง และตั้งแท่นชาร์จบนแผนที่ใหม่ให้พร้อมก่อนยืนยัน');
    }
    await putDocument('robot-active-map', 'robot-binding', { ...binding, dockNeedsVerification: false });
    setDockVerificationRequired(false);
    return { verified: true, home: map.home };
  });
}
export async function storeArchive(name: string, bytes: Buffer, source: RobotMapArchive['source']) {
  if (bytes.length < 16 || bytes.length > 20_000_000 || bytes.subarray(0, 4).toString('ascii') !== 'STCM') throw new ApiError(422, 'invalid_stcm', 'ใช้ไฟล์ STCM ที่ถูกต้อง ขนาดไม่เกิน 20 MB');
  const item: RobotMapArchive = { id: randomUUID(), name, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString(), source };
  await putDocument(item.id + ':blob', 'robot-map-blob', { base64: bytes.toString('base64') });
  await putDocument(item.id, 'robot-map-archive', item);
  return item;
}
export async function captureMap(name: string, source: RobotMapArchive['source'] = 'robot') {
  if (!hermes) throw new ApiError(409, 'robot_required', 'ต้องเชื่อมต่อหุ่นจริง');
  return storeArchive(name, await hermes.downloadCompositeMap(), source);
}
export async function archiveBytes(id: string) {
  const item = await getDocument<RobotMapArchive>(id, 'robot-map-archive');
  const blob = await getDocument<{ base64: string }>(id + ':blob', 'robot-map-blob');
  if (!item || !blob) throw new ApiError(404, 'not_found', 'ไม่พบไฟล์แผนที่');
  const bytes = Buffer.from(blob.base64, 'base64');
  if (bytes.length !== item.byteLength || createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new ApiError(500, 'map_corrupt', 'ไฟล์แผนที่ไม่ผ่านการตรวจความถูกต้อง');
  return { item, bytes };
}
export async function activateMap(id: string) {
  return withMaintenance(requireIdleRobot, async () => {
    const { item, bytes } = await archiveBytes(id);
    const previous = await getDocument<Binding>('robot-active-map', 'robot-binding');
    let backup: { id: string };
    try { backup = await captureMap('สำรองก่อนโหลด ' + item.name, 'backup'); }
    catch (error) {
      // An empty/partially cleared map may not export. Only its already-verified pre-clear backup can bypass that export.
      if (previous?.resetBackupId !== id) throw error;
      backup = { id };
    }
    pendingReturn = null;
    // Persist the interlock BEFORE touching hardware. An interrupted upload remains blocked after restart.
    const binding: Binding = { archiveId: id, needsLocalization: true, dockNeedsVerification: previous?.dockNeedsVerification === true, resetBackupId: previous?.resetBackupId };
    await putDocument('robot-active-map', 'robot-binding', binding);
    setLocalizationRequired(true);
    invalidateLiveMap();
    try {
      // Loading explicitly replaces the working map. Freeze mapping only after its backup is durable.
      await hermes!.setOperatingMode('normal');
      await hermes!.uploadCompositeMap(bytes);
      let confirmed = false;
      const deadline = Date.now() + 6000;
      do {
        try {
          const map = await hermes!.inspectMap();
          if (map.mappingEnabled === false && map.width > 0 && map.height > 0) { confirmed = true; break; }
        } catch { /* Firmware may briefly have no readable grid while replacing it. */ }
        if (Date.now() >= deadline) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      } while (Date.now() < deadline);
      if (!confirmed) throw new ApiError(503, 'map_unconfirmed', 'โหลดแผนที่แล้วแต่ยืนยันสถานะไม่ได้ ห้ามนำทางจนกว่าจะตรวจตำแหน่งใหม่');
    } finally { invalidateLiveMap(); }
    await putDocument('robot-active-map', 'robot-binding', { archiveId: id, needsLocalization: true, dockNeedsVerification: false });
    setDockVerificationRequired(false);
    return { id, backupId: backup.id, needsLocalization: true, hardwareApplied: true, persistentOnRobot: false };
  });
}
export async function confirmPose(raw: unknown) {
  const pose = poseInput.parse(raw);
  return withMaintenance(requireIdleRobot, async () => {
    const map = await hermes!.inspectMap();
    if (map.mappingEnabled !== false) throw new ApiError(409, 'mapping_active', 'ปิดโหมดสร้างแผนที่ก่อนระบุตำแหน่ง');
    insideMap(map, pose);
    const actual = await hermes!.setPose(pose.x, pose.y, pose.headingDeg * Math.PI / 180);
    const binding = await getDocument<Binding>('robot-active-map', 'robot-binding');
    await putDocument('robot-active-map', 'robot-binding', { ...binding, archiveId: binding?.archiveId ?? null, needsLocalization: false });
    setLocalizationRequired(false);
    // Navigation policy still independently requires fresh localization quality >= 50.
    return { pose: actual, verified: true, minLocalizationQuality: config.robot.minLocalizationQuality };
  });
}
export async function writeWall(raw: unknown, id?: number): Promise<RobotWall> {
  const wall = wallInput.parse(raw);
  return withMaintenance(requireIdleRobot, async () => {
    const map = await hermes!.inspectMap();
    if (map.mappingEnabled !== false) throw new ApiError(409, 'mapping_active', 'ปิดโหมดสร้างแผนที่ก่อนแก้กำแพง');
    insideMap(map, wall.start); insideMap(map, wall.end);
    return hermes!.saveWall(wall, id);
  });
}
export async function configureStandby(raw: unknown) {
  const value = standbyInput.parse(raw);
  return withMaintenance(requireIdleRobot, async () => {
    const map = await hermes!.inspectMap();
    if (map.mappingEnabled !== false || !map.pois) throw new ApiError(409, 'map_unavailable', 'ต้องมีแผนที่และ POI ในโหมดปกติ');
    const poi = map.pois.find(p => p.id === value.poiId);
    if (value.poiId && (!poi?.pose || ![poi.pose.x, poi.pose.y, poi.pose.yaw].every(Number.isFinite))) throw new ApiError(422, 'unknown_poi', 'ไม่พบจุดประจำบนหุ่น');
    const result: Standby = { ...value, mapSignature: mapSignature(map), updatedAt: new Date().toISOString() };
    pendingReturn = null;
    await putDocument('robot-standby', 'robot-standby', result);
    return result;
  });
}
export async function returnToStandby(requester: { id: number | null; name: string | null; ip?: string }) {
  requireIdleRobot();
  const setting = await getDocument<Standby>('robot-standby', 'robot-standby');
  if (!setting?.poiId) throw new ApiError(409, 'no_standby', 'ยังไม่ได้ตั้งจุดประจำ');
  const map = await hermes!.inspectMap();
  if (mapSignature(map) !== setting.mapSignature) throw new ApiError(409, 'standby_map_changed', 'แผนที่เปลี่ยนแล้ว กรุณาตั้งจุดประจำใหม่');
  const poi = map.pois?.find(p => p.id === setting.poiId);
  if (!poi?.pose) throw new ApiError(409, 'standby_missing', 'จุดประจำถูกลบหรืออ่านไม่ได้');
  return createJob('STANDBY:' + poi.id, requester.id === null ? 'auto' : 'operator', requester, { target: { code: 'STANDBY:' + poi.id,
    nameTh: 'จุดประจำ: ' + String(poi.metadata?.display_name ?? poi.id), x: poi.pose.x, y: poi.pose.y,
    headingDeg: poi.pose.yaw * 180 / Math.PI, isDock: false, isPublic: false } });
}
export async function maybeReturnToStandby() {
  if (pendingReturn === null || standbyBusy) return;
  const jobId = pendingReturn; pendingReturn = null; standbyBusy = true;
  try {
    const w = getWorld(), job = w.jobs.find(j => j.id === jobId);
    const setting = await getDocument<Standby>('robot-standby', 'robot-standby');
    if (!job || job.status !== 'arrived' || job.source === 'auto' || job.destPoiCode === 'DOCK' || job.destPoiCode.startsWith('STANDBY:') || setting?.returnPolicy !== 'after_job') return;
    requireIdleRobot();
    await returnToStandby({ id: null, name: 'กลับจุดประจำหลังจบงาน' });
  } catch (error) {
    getWorld().addAudit(null, 'robot.standby.skipped', String(jobId), { reason: String(error) });
    // Consume once: no surprise movement later when link/quality recovers.
  } finally { standbyBusy = false; }
}
export async function initializeRobotControl() {
  setHardwareIdleCheck(config.robotMode === 'hermes' ? async () => {
    const action = await hermes!.currentAction();
    if (action && action.state?.status !== 4) throw new ApiError(409, 'external_robot_action', 'หุ่นมีคำสั่งทำงานอยู่จากอุปกรณ์อื่น กรุณาสิ้นสุดงานก่อนตั้งค่า');
  } : null);
  const saved = await getDocument<unknown>('robot-motion-settings', 'robot-settings');
  const parsed = speedInput.safeParse(saved);
  if (parsed.success) updateMotionSettings(parsed.data);
  const binding = await getDocument<Binding>('robot-active-map', 'robot-binding');
  setLocalizationRequired(binding?.needsLocalization === true);
  setDockVerificationRequired(binding?.dockNeedsVerification === true);
  setArrivalHandler(jobId => { pendingReturn = jobId; });
}
export async function listMapArchives() { return listDocuments<RobotMapArchive>('robot-map-archive'); }
