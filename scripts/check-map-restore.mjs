// Restore the verified pre-clear backup only. Never requests motion or guesses robot pose.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const base = 'http://localhost:4000/api';
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const request = async (path, method = 'GET', body) => {
  assert.ok(!/navigate|dock|estop|\/jobs|\/manual|localization|operating-mode|\/map\/clear/.test(path), 'Forbidden endpoint');
  const r = await fetch(base + path, { method, headers: { cookie, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.headers.get('content-type')?.includes('octet-stream') ? Buffer.from(await r.arrayBuffer()) : r.json();
};
const summary = map => ({ x: map.x, y: map.y, width: map.width, height: map.height, resolution: map.resolution, mappingEnabled: map.mappingEnabled,
  poiCount: map.pois?.length, wallCount: map.walls?.length, quality: map.localizationQuality,
  gridSha256: createHash('sha256').update(map.cellsBase64).digest('hex') });
const state = await request('/robot/state'), settings = await request('/robot/settings');
assert.equal(state.simulated, false); assert.equal(state.linkStatus, 'ok'); assert.equal(state.mode, 'idle');
assert.equal(state.currentJob, null); assert.equal(state.lock.mode, null);
const before = await request('/robot/live-map'), archives = await request('/robot/map-archives');
const targetId = process.argv.find(arg => arg.startsWith('--target='))?.slice(9) ?? settings.binding?.resetBackupId;
assert.ok(targetId, 'Specify a backup ID; never choose an arbitrary map');
const target = archives.find(item => item.id === targetId); assert.ok(target);
const bytes = await request(`/robot/map-archives/${targetId}/download`);
assert.equal(bytes.subarray(0, 4).toString(), 'STCM'); assert.equal(bytes.length, target.byteLength);
assert.equal(createHash('sha256').update(bytes).digest('hex'), target.sha256);
const report = { at: new Date().toISOString(), realRobot: true, motionDispatched: false, target, before: summary(before), applied: false };
const out = 'reports/map-restore-2026-10-21'; await fs.mkdir(out, { recursive: true });
try {
  if (process.argv.includes('--apply')) {
    assert.equal(targetId, settings.binding?.resetBackupId, 'Only restore this clear operation’s verified backup');
    report.activation = await request(`/robot/map-archives/${targetId}/activate`, 'POST', {});
    report.applied = true;
    const after = await request('/robot/live-map'), afterSettings = await request('/robot/settings'), afterState = await request('/robot/state');
    report.after = summary(after); report.binding = afterSettings.binding;
    assert.equal(after.mappingEnabled, false); assert.ok(after.width > 0 && after.height > 0);
    assert.notEqual(report.after.gridSha256, report.before.gridSha256, 'Restored grid must replace the newly explored grid');
    assert.equal(afterSettings.binding.archiveId, targetId); assert.equal(afterSettings.binding.needsLocalization, true);
    assert.equal(afterState.currentJob, null); assert.equal(afterState.mode, 'idle'); assert.equal(afterState.linkStatus, 'ok');
    const backup = await request(`/robot/map-archives/${report.activation.backupId}/download`);
    assert.equal(backup.subarray(0, 4).toString(), 'STCM'); report.currentMapBackupVerified = true;
    report.passed = true;
  }
} catch (error) { report.error = String(error); process.exitCode = 1; }
await fs.writeFile(out + (report.applied ? '/restore.json' : '/inspection.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
