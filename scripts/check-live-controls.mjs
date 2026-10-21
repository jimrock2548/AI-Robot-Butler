// Real robot integration. No motion action, navigation, docking or E-stop requests.
// --apply permits reversible POI/wall/speed writes and a same-map STCM round trip.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const base = 'http://localhost:4000/api';
const robot = process.env.HERMES_BASE_URL || 'http://192.168.1.63:1448';
const apply = process.argv.includes('--apply');
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const request = async (path, method = 'GET', body, binary = false) => {
  assert.ok(!/navigate|dock|estop|\/jobs|standby\/return|\/manual/.test(path), 'Motion endpoints forbidden in this check');
  const r = await fetch(base + path, { method, headers: { cookie, 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }, ...(body !== undefined ? { body: binary ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.headers.get('content-type')?.includes('octet-stream') ? Buffer.from(await r.arrayBuffer()) : r.json();
};
const robotGet = async path => {
  const r = await fetch(robot + path, { signal: AbortSignal.timeout(10000) });
  if (r.status === 404) return null;
  assert.ok(r.ok, 'Robot GET ' + path + ' ' + r.status); return r.json();
};
const before = await request('/robot/state');
assert.equal(before.simulated, false); assert.equal(before.linkStatus, 'ok'); assert.equal(before.currentJob, null); assert.equal(before.lock.mode, null);
const currentAction = await robotGet('/api/core/motion/v1/actions/:current');
assert.ok(!currentAction || currentAction.state?.status === 4, 'External robot action is active; skip all maintenance');
const settings = await request('/robot/settings'), map = await request('/robot/live-map');
assert.equal(map.mappingEnabled, false);
const pose = await robotGet('/api/core/slam/v1/localization/pose');
const existingWalls = await request('/robot/walls');
const report = { date: new Date().toISOString(), realRobot: true, apply, motionDispatched: false, before: { quality: map.localizationQuality, poiCount: map.pois.length, wallCount: existingWalls.length, speed: settings.actual }, checks: [] };
const check = async (name, fn) => { const at = Date.now(); const detail = await fn(); report.checks.push({ name, passed: true, elapsedMs: Date.now() - at, detail }); console.log(name, 'PASS'); return detail; };
const verifyLink = async () => { const s = await request('/robot/state'); assert.equal(s.linkStatus, 'ok'); assert.equal(s.currentJob, null); return s; };
let tempPoi, tempWall, restoreMap, mapTouched = false;
try {
  await check('real settings / map / walls readable', async () => ({ limits: settings.actual, mappingEnabled: map.mappingEnabled, walls: existingWalls.length }));
  if (apply) {
    await check('speed increase and verified restoration', async () => {
      try {
        const value = settings.actual.linearMps >= 0.15 ? 0.1 : 0.15;
        const result = await request('/robot/speed', 'PUT', { linearMps: value, angularRps: settings.actual.angularRps });
        assert.equal(result.verified, true); assert.ok(Math.abs((await request('/robot/settings')).actual.linearMps - value) < 0.00001);
      } finally { await request('/robot/speed', 'PUT', settings.actual); }
      await verifyLink(); return { restored: (await request('/robot/settings')).actual };
    });
    await check('normal mode verified on hardware', async () => {
      const result = await request('/robot/operating-mode', 'PUT', { mode: 'normal' }); assert.equal(result.mappingEnabled, false); return result;
    });
    await check('POI create / update / delete keeps link', async () => {
      const p = map.pois.find(p => p.pose); assert.ok(p);
      const data = { name: '__CONTROL_TEST__', aliases: [], x: p.pose.x, y: p.pose.y, headingDeg: p.pose.yaw * 180 / Math.PI };
      tempPoi = await request('/robot/pois', 'POST', data); await verifyLink();
      const saved = await request('/robot/pois/' + tempPoi.id, 'PUT', { ...data, name: '__CONTROL_TEST_UPDATED__', aliases: ['control-test-only'] });
      assert.equal(saved.metadata.display_name, '__CONTROL_TEST_UPDATED__'); await verifyLink();
      await request('/robot/pois/' + tempPoi.id, 'DELETE'); tempPoi = null; await verifyLink();
      return { originalPoiCount: map.pois.length };
    });
    await check('wall add / update / delete preserves original walls', async () => {
      // Duplicate an existing boundary while stationary; never remove any original wall.
      const original = existingWalls[0]; assert.ok(original, 'Need an existing wall for an overlapping test segment');
      tempWall = await request('/robot/walls', 'POST', { start: original.start, end: original.end });
      assert.ok(!existingWalls.some(w => w.id === tempWall.id));
      const midpoint = { x: (original.start.x + original.end.x) / 2, y: (original.start.y + original.end.y) / 2 };
      await request('/robot/walls/' + tempWall.id, 'PUT', { start: original.start, end: midpoint });
      await request('/robot/walls/' + tempWall.id, 'DELETE'); tempWall = null;
      assert.deepEqual(await request('/robot/walls'), existingWalls); await verifyLink(); return { originalWallsPreserved: true };
    });
    await check('standby selection persists without dispatch', async () => {
      const poi = map.pois.find(p => p.pose); assert.ok(poi);
      try {
        await request('/robot/standby', 'PUT', { poiId: poi.id, returnPolicy: 'manual' });
        assert.equal((await request('/robot/settings')).standby.poiId, poi.id);
        await verifyLink();
      } finally { await request('/robot/standby', 'PUT', { poiId: settings.standby?.poiId ?? null, returnPolicy: settings.standby?.returnPolicy ?? 'manual' }); }
      return { dispatch: false, restoredPreviousSelection: true };
    });
    await check('STCM capture / download / upload / activate / pose restoration', async () => {
      restoreMap = await request('/robot/map-archives/capture', 'POST', { name: 'ห้องแลป · สำรองก่อนตรวจระบบ 21 ต.ค. 2569' });
      const bytes = await request(`/robot/map-archives/${restoreMap.id}/download`);
      assert.equal(bytes.subarray(0, 4).toString(), 'STCM'); assert.equal(createHash('sha256').update(bytes).digest('hex'), restoreMap.sha256);
      const uploaded = await request('/robot/map-archives/upload?name=' + encodeURIComponent('สำเนาห้องแลป · ตรวจอัปโหลด'), 'POST', bytes, true);
      assert.equal(uploaded.sha256, restoreMap.sha256);
      mapTouched = true;
      const applied = await request(`/robot/map-archives/${uploaded.id}/activate`, 'POST', {});
      assert.equal(applied.needsLocalization, true);
      assert.equal((await request('/robot/settings')).binding.needsLocalization, true);
      await request('/robot/localization', 'PUT', { x: pose.x, y: pose.y, headingDeg: pose.yaw * 180 / Math.PI });
      // Leave the named original backup as the final active map, never the test copy.
      await request(`/robot/map-archives/${restoreMap.id}/activate`, 'POST', {});
      await request('/robot/localization', 'PUT', { x: pose.x, y: pose.y, headingDeg: pose.yaw * 180 / Math.PI });
      mapTouched = false;
      assert.equal((await request('/robot/settings')).binding.needsLocalization, false);
      await verifyLink(); return { archiveId: restoreMap.id, uploadId: uploaded.id, backupId: applied.backupId, restoredPose: pose };
    });
  }
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
  const cleanup = [];
  if (tempPoi) await request('/robot/pois/' + tempPoi.id, 'DELETE').catch(e => cleanup.push(String(e)));
  if (tempWall) await request('/robot/walls/' + tempWall.id, 'DELETE').catch(e => cleanup.push(String(e)));
  if (mapTouched && restoreMap) {
    await request(`/robot/map-archives/${restoreMap.id}/activate`, 'POST', {}).then(() => request('/robot/localization', 'PUT', { x: pose.x, y: pose.y, headingDeg: pose.yaw * 180 / Math.PI })).catch(e => cleanup.push(String(e)));
  }
  report.cleanupErrors = cleanup; if (cleanup.length) process.exitCode = 1;
  report.after = await request('/robot/state').then(s => ({ linkStatus: s.linkStatus, currentJob: s.currentJob, mode: s.mode })).catch(e => ({ error: String(e) }));
  const finalMap = await request('/robot/live-map').catch(() => null);
  report.afterMap = finalMap ? { quality: finalMap.localizationQuality, poiCount: finalMap.pois?.length, wallCount: finalMap.walls?.length } : null;
  report.passed = report.checks.filter(c => c.passed).length;
  await fs.mkdir('reports/robot-controls-2026-10-21', { recursive: true });
  await fs.writeFile('reports/robot-controls-2026-10-21/live-controls.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, error: report.error, after: report.after, cleanupErrors: cleanup }));
}
