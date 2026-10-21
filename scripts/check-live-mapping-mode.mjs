// Stationary hardware test only. No motion requests. Restore the exact pre-test map and pose.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const base = 'http://localhost:4000/api';
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  assert.ok(!/navigate|dock|estop|\/jobs|standby\/return|\/manual/.test(path), 'Motion requests are forbidden');
  const response = await fetch(base + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
};
const report = { at: new Date().toISOString(), stationaryOnly: true, motionDispatched: false, checks: [], cleanupErrors: [] };
let backup, pose, touched = false;
try {
  const state = await call('/robot/state');
  assert.equal(state.simulated, false); assert.equal(state.linkStatus, 'ok'); assert.equal(state.mode, 'idle'); assert.equal(state.currentJob, null); assert.equal(state.lock.mode, null);
  const settings = await call('/robot/settings');
  assert.equal(settings.mappingEnabled, false);
  const response = await fetch((process.env.HERMES_BASE_URL || 'http://192.168.1.63:1448') + '/api/core/slam/v1/localization/pose', { signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok); pose = await response.json();
  report.before = { speed: settings.actual, standby: settings.standby, pose };
  backup = await call('/robot/map-archives/capture', 'POST', { name: 'สำรองก่อนทดสอบสลับโหมด · 21 ต.ค. 2569' });
  touched = true;
  const enabled = await call('/robot/operating-mode', 'PUT', { mode: 'exploration' });
  assert.equal(enabled.mappingEnabled, true);
  const readback = await call('/robot/settings'); assert.equal(readback.mappingEnabled, true);
  report.checks.push({ name: 'enable mapping and read back from real robot', passed: true });
  await new Promise(resolve => setTimeout(resolve, 1200));
  const disabled = await call('/robot/operating-mode', 'PUT', { mode: 'normal' }); assert.equal(disabled.mappingEnabled, false);
  report.checks.push({ name: 'return to normal and read back from real robot', passed: true });
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
  if (touched && backup && pose) {
    try {
      await call('/robot/operating-mode', 'PUT', { mode: 'normal' });
      await call(`/robot/map-archives/${backup.id}/activate`, 'POST', {});
      await call('/robot/localization', 'PUT', { x: pose.x, y: pose.y, headingDeg: pose.yaw * 180 / Math.PI });
      report.checks.push({ name: 'restore pre-test map and pose', passed: true, backupId: backup.id });
    } catch (error) { report.cleanupErrors.push(String(error)); process.exitCode = 1; }
  }
  try {
    const [state, settings, map] = await Promise.all([call('/robot/state'), call('/robot/settings'), call('/robot/live-map')]);
    assert.equal(state.currentJob, null); assert.equal(state.mode, 'idle'); assert.equal(state.linkStatus, 'ok');
    if (report.before) assert.deepEqual(settings.actual, report.before.speed, 'Do not change operator speed preferences');
    report.after = { state, settings, localizationQuality: map.localizationQuality, poiCount: map.pois?.length, wallCount: map.walls?.length };
  } catch (error) { report.cleanupErrors.push(String(error)); process.exitCode = 1; }
  report.passed = report.checks.filter(c => c.passed).length;
  await fs.mkdir('reports/remaining-tests-2026-10-21', { recursive: true });
  await fs.writeFile('reports/remaining-tests-2026-10-21/mapping-mode.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, error: report.error, cleanupErrors: report.cleanupErrors, afterQuality: report.after?.localizationQuality }));
}
