// Hardware movement: ONLY with an on-site observer and the explicitly approved door POI.
// Each invocation runs one bounded case and restores settings only after confirming no active job.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const testCase = process.argv.find(v => v.startsWith('--case='))?.split('=')[1] ?? 'cancel';
assert.ok(['cancel', 'estop', 'navigate', 'return-cycle', 'standby', 'dock'].includes(testCase));
assert.ok(process.argv.includes('--execute'), 'Explicit --execute and an on-site observer are required');
const base = 'http://localhost:4000/api', robot = process.env.HERMES_BASE_URL || 'http://192.168.1.63:1448';
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }), signal: AbortSignal.timeout(5000) });
assert.equal(login.status, 200);
const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
const call = async (path, method = 'GET', body) => {
  const r = await fetch(base + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};
const robotGet = async path => { const r = await fetch(robot + path, { signal: AbortSignal.timeout(3000) }); if (r.status === 404) return null; assert.ok(r.ok); return r.json(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = 'reports/supervised-motion-2026-10-21'; await fs.mkdir(out, { recursive: true });
const report = { at: new Date().toISOString(), case: testCase, approvedPoi: 'หน้าประตูห้อง', supervised: true, samples: [], passed: false, cleanupErrors: [] };
let original, activeId, speedTouched = false, dispatchAttempted = false;
let standbyPoint, outboundPoint, corridorStart, standbyEdited = false, outboundArrived = false;
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; });
try {
  const state = await call('/robot/state'), map = await call('/robot/live-map');
  original = await call('/robot/settings');
  assert.equal(state.simulated, false); assert.equal(state.linkStatus, 'ok'); assert.equal(state.mode, 'idle'); assert.equal(state.currentJob, null); assert.equal(state.lock.mode, null);
  assert.equal(map.mappingEnabled, false); assert.ok(map.localizationQuality >= 50); assert.ok(!original.binding?.needsLocalization);
  const action = await robotGet('/api/core/motion/v1/actions/:current'); assert.ok(!action || action.state?.status === 4, 'External action is active');
  const candidates = map.pois.filter(p => p.metadata?.display_name === 'หน้าประตูห้อง'); assert.equal(candidates.length, 1, 'Approved POI must resolve uniquely');
  const target = candidates[0]; assert.ok(target.pose);
  const start = state.telemetry; assert.ok(start);
  assert.ok(Math.hypot(target.pose.x - start.x, target.pose.y - start.y) <= 2.5, 'Door is outside the short supervised test area');
  report.before = { state, quality: map.localizationQuality, settings: original, poi: target };
  await fs.writeFile(`${out}/${testCase}-latest.json`, JSON.stringify(report, null, 2));
  await call('/robot/speed', 'PUT', { linearMps: 0.1, angularRps: 0.3 }); speedTouched = true;
  if (original.standby?.returnPolicy === 'after_job') await call('/robot/standby', 'PUT', { poiId: original.standby.poiId, returnPolicy: 'manual' });
  const preview = await call('/ai/command', 'POST', { transcript: 'ช่วยพาไปหน้าประตูห้องหน่อย', lang: 'th', dryRun: true });
  assert.equal(preview.rejected, false); assert.equal(preview.target?.id, target.id); assert.ok(!preview.job);
  if (testCase === 'return-cycle') {
    const previous = JSON.parse(await fs.readFile(`${out}/cancel-latest.json`, 'utf8'));
    assert.equal(previous.passed, true);
    corridorStart = previous.before.state.telemetry;
    assert.ok(Math.hypot(target.pose.x - start.x, target.pose.y - start.y) < 0.3, 'Automatic return test starts only after reaching the approved door');
    standbyPoint = target.pose;
    outboundPoint = { x: (corridorStart.x + target.pose.x) / 2, y: (corridorStart.y + target.pose.y) / 2 };
    const col = Math.floor((outboundPoint.x - map.x) / map.resolution), row = Math.floor((outboundPoint.y - map.y) / map.resolution);
    const cell = Buffer.from(map.cellsBase64, 'base64')[row * map.width + col];
    assert.ok(cell > 0 && cell < 128, 'Midpoint of the confirmed corridor is not a known free cell');
    await call('/robot/standby', 'PUT', { poiId: target.id, returnPolicy: 'after_job' }); standbyEdited = true;
    report.standbyTarget = target; report.outboundPoint = outboundPoint;
  }
  if (testCase === 'standby') {
    await call('/robot/standby', 'PUT', { poiId: target.id, returnPolicy: 'manual' }); standbyEdited = true;
    report.standbyTarget = target;
  }
  let result;
  dispatchAttempted = true;
  if (testCase === 'return-cycle') result = { job: await call('/robot/navigate', 'POST', outboundPoint) };
  else if (testCase === 'standby') result = { job: await call('/robot/standby/return', 'POST', {}) };
  else if (testCase === 'dock' || (testCase === 'estop' && Math.hypot(start.x - target.pose.x, start.y - target.pose.y) < 0.3)) result = { job: await call('/robot/dock', 'POST', {}) };
  else result = await call('/ai/command', 'POST', { transcript: 'ช่วยพาไปหน้าประตูห้องหน่อย', lang: 'th', dryRun: false });
  assert.ok(result.job?.id, 'No confirmed job returned'); activeId = result.job.id;
  report.job = result.job;
  console.log(JSON.stringify({ stage: 'dispatched', case: testCase, job: activeId, target: result.job.destName, speed: 0.1 }));
  const deadline = Date.now() + 75000, begun = Date.now(); let moved = 0, stopped = false, lastMapAt = 0;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('Interrupted by operator');
    const s = await call('/robot/state');
    assert.equal(s.linkStatus, 'ok', 'Robot link is not fresh'); assert.ok(s.telemetry);
    moved = Math.hypot(s.telemetry.x - start.x, s.telemetry.y - start.y);
    assert.ok(moved <= 2.6, 'Robot left the bounded test area');
    const a = corridorStart ?? { x: start.x, y: start.y }, b = target.pose;
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    if (length2 > 0.1) {
      const projection = Math.max(0, Math.min(1, ((s.telemetry.x - a.x) * dx + (s.telemetry.y - a.y) * dy) / length2));
      assert.ok(Math.hypot(s.telemetry.x - (a.x + projection * dx), s.telemetry.y - (a.y + projection * dy)) <= 0.55, 'Robot deviated from the supervised corridor');
    }
    report.samples.push({ at: new Date().toISOString(), x: s.telemetry.x, y: s.telemetry.y, heading: s.telemetry.headingDeg, mode: s.mode, link: s.linkStatus, job: s.currentJob?.id });
    if (Date.now() - lastMapAt >= 1500) {
      const m = await call('/robot/live-map'); assert.ok(m.localizationQuality >= 50, 'Localization dropped below 50'); assert.equal(m.mappingEnabled, false); lastMapAt = Date.now();
    }
    const headingDelta = Math.abs(((s.telemetry.headingDeg - start.headingDeg + 540) % 360) - 180);
    if (['cancel', 'estop'].includes(testCase) && !stopped && (moved >= 0.15 || (testCase === 'estop' && headingDelta >= 15) || Date.now() - begun > 10000)) {
      if (testCase === 'estop') await call('/robot/estop', 'POST', {});
      else await call(`/jobs/${activeId}/cancel`, 'POST', { reason: 'ทดสอบหยุดแบบมีผู้ดูแล ณ หน้าประตูห้อง' });
      stopped = true;
      const position = (await call('/robot/state')).telemetry;
      for (let i = 0; i < 8; i++) {
        await sleep(250); const settled = await call('/robot/state'); assert.equal(settled.linkStatus, 'ok'); assert.equal(settled.currentJob, null);
        assert.ok(Math.hypot(settled.telemetry.x - position.x, settled.telemetry.y - position.y) < 0.08, 'Robot did not settle after stop');
        assert.ok(Math.abs(((settled.telemetry.headingDeg - position.headingDeg + 540) % 360) - 180) < 10, 'Robot kept rotating after stop');
      }
      report.movedBeforeStopM = moved; report.rotatedBeforeStopDeg = headingDelta;
      assert.ok(moved >= 0.05 || (testCase === 'estop' && headingDelta >= 5), 'No measured movement: stop while moving was not demonstrated');
      const detail = await call('/jobs/' + activeId); assert.equal(detail.status, testCase === 'estop' ? 'stopped' : 'cancelled'); report.jobResult = detail;
      activeId = null;
      // Leave E-stop engaged until the operator explicitly requests a reset.
      break;
    }
    const detail = await call('/jobs/' + activeId);
    if (detail.status === 'arrived') {
      assert.ok(!['cancel', 'estop'].includes(testCase), 'Arrived before stop test could be exercised');
      if (testCase === 'return-cycle' && !outboundArrived) {
        assert.ok(Math.hypot(s.telemetry.x - outboundPoint.x, s.telemetry.y - outboundPoint.y) <= 0.3, 'Outbound arrival is outside tolerance');
        report.outboundResult = detail; outboundArrived = true;
        console.log(JSON.stringify({ stage: 'corridor-midpoint-arrived', job: activeId }));
        let returned;
        for (let i = 0; i < 20; i++) {
          const next = await call('/robot/state');
          if (next.currentJob) { returned = next.currentJob; break; }
          await sleep(250);
        }
        assert.ok(returned?.source === 'auto' && returned.destPoiCode === 'STANDBY:' + target.id, 'Automatic standby return was not started');
        activeId = returned.id; report.returnJob = returned;
        console.log(JSON.stringify({ stage: 'auto-return-started', job: activeId }));
        continue;
      }
      report.jobResult = detail; activeId = null;
      if (testCase === 'return-cycle') assert.ok(Math.hypot(s.telemetry.x - standbyPoint.x, s.telemetry.y - standbyPoint.y) <= 0.3, 'Standby arrival is outside tolerance');
      else if (testCase !== 'dock') assert.ok(Math.hypot(s.telemetry.x - target.pose.x, s.telemetry.y - target.pose.y) <= 0.3, 'Arrival position is outside tolerance');
      if (testCase === 'dock') {
        const power = await robotGet('/api/core/system/v1/power/status'); report.power = power;
        assert.ok(power?.isCharging === true || power?.isDCConnected === true, 'Dock arrival does not confirm electrical charging');
      }
      break;
    }
    assert.ok(!['failed', 'cancelled', 'stopped'].includes(detail.status), `Job ended: ${detail.status}`);
    await sleep(250);
  }
  assert.equal(activeId, null, 'Test time limit exceeded'); report.passed = true;
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
  try {
    const s = await call('/robot/state');
    if (activeId && s.currentJob?.id === activeId) await call(`/jobs/${activeId}/cancel`, 'POST', { reason: 'สิ้นสุดการทดสอบแบบมีผู้ดูแล' });
    else if (dispatchAttempted && !report.job && s.currentJob) await call('/robot/estop', 'POST', {});
    const finalState = await call('/robot/state'); report.after = finalState;
    // Do not increase speed, reset E-stop or change settings while a job/stop is active.
    if (speedTouched && original && finalState.linkStatus === 'ok' && finalState.mode === 'idle' && !finalState.currentJob && !finalState.lock.mode) {
      if (standbyEdited || original.standby?.returnPolicy === 'after_job') await call('/robot/standby', 'PUT', { poiId: original.standby?.poiId ?? null, returnPolicy: original.standby?.returnPolicy ?? 'manual' });
      await call('/robot/speed', 'PUT', original.actual);
      report.speedRestored = true;
    }
  } catch (error) { report.cleanupErrors.push(String(error)); process.exitCode = 1; }
  await fs.writeFile(`${out}/${testCase}-latest.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ case: testCase, passed: report.passed, error: report.error, cleanupErrors: report.cleanupErrors, afterMode: report.after?.mode, afterJob: report.after?.currentJob?.id ?? null, movedBeforeStopM: report.movedBeforeStopM }));
}
