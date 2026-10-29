import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveRobotMap, RobotWall } from '@hermes/shared';

process.env.ROBOT_MODE = 'hermes';
process.env.HERMES_READ_ONLY = 'false';
const nativeFetch = globalThis.fetch;
const poiId = '00000000-0000-4000-8000-000000000001';
const bytes = Buffer.from('STCM-test-composite-map-contents');
let linear = 0.1, angular = 0.3, mapping = false, rejectAngularOnce = false;
let walls: RobotWall[] = [], seq = 0, actions = 0, externalBusy = false;
let pose = { x: 0, y: 0, yaw: 0 };
let clears = 0, rejectClear = false, rejectBackup = false;
let unreadableMapReads = 0;
const calls: { method: string; path: string }[] = [];
globalThis.fetch = (async (input, init) => {
  const url = new URL(String(input)), path = url.pathname, method = init?.method ?? 'GET';
  calls.push({ method, path });
  const body = init?.body && !(init.body instanceof Uint8Array) ? JSON.parse(String(init.body)) : null;
  if (path.endsWith('/parameter')) {
    if (method === 'PUT') {
      if (body.param === 'base.max_angular_speed' && rejectAngularOnce) { rejectAngularOnce = false; return Response.json(false); }
      if (body.param === 'base.max_moving_speed') linear = Number(body.value); else angular = Number(body.value);
      return Response.json(true);
    }
    return Response.json(String(url.searchParams.get('param') === 'base.max_moving_speed' ? linear : angular));
  }
  if (path.endsWith('/mapping/:enable')) { if (method === 'PUT') mapping = body.enable; return Response.json(method === 'GET' ? mapping : true); }
  if (path.endsWith('/maps/stcm')) { if (method === 'GET') return rejectBackup ? new Response(null, { status: 503 }) : new Response(new Uint8Array(bytes)); return new Response(null, { status: 200 }); }
  if (path === '/api/core/slam/v1/maps' && method === 'DELETE') { if (rejectClear) return Response.json(false); clears++; return new Response(null, { status: 200 }); }
  if (path.endsWith('/maps/explore')) return new Response(null, { status: 404 });
  if (path.endsWith('/pois') && method === 'GET') return Response.json(map.pois);
  if (path.includes('/pois/') && method === 'DELETE') { map.pois = map.pois!.filter(p => !path.endsWith('/' + p.id)); return Response.json(true); }
  if (path.endsWith('/localization/pose')) { if (method === 'PUT') pose = body; return Response.json(pose); }
  if (path.endsWith('/lines/walls')) {
    if (method === 'POST') walls.push({ ...body[0], id: ++seq });
    if (method === 'PUT') walls = walls.map(w => w.id === body[0].id ? body[0] : w);
    return Response.json(method === 'GET' ? walls : true);
  }
  if (path.includes('/lines/walls/')) { walls = walls.filter(w => !path.endsWith('/' + w.id)); return Response.json(true); }
  if (path.endsWith('/power/status')) return Response.json({ batteryPercentage: 100 });
  if (path.endsWith('/speed')) return Response.json({ vx: 0, vy: 0 });
  if (path.endsWith('/runtime')) return Response.json(10);
  if (path.endsWith('/actions') && method === 'POST') { actions++; return Response.json({ action_id: actions }); }
  if (path.endsWith('/actions/:current') && method === 'DELETE') return new Response(null, { status: 204 });
  if (path.includes('/actions/') && method === 'GET') return Response.json({ action_id: actions, state: { status: externalBusy ? 1 : 4, result: 0 } });
  throw new Error('Unexpected test request: ' + method + ' ' + path);
}) as typeof fetch;
const { HermesClient } = await import('../src/hermes/hermesClient');
const map: LiveRobotMap = { x: -2, y: -2, width: 10, height: 10, resolution: 1, cellsBase64: Buffer.alloc(100, 127).toString('base64'),
  localizationQuality: 90, home: null, poiCount: 1, modelName: null, softwareVersion: null, dockingStatus: null, mappingEnabled: false,
  capturedAt: new Date().toISOString(), pois: [{ id: poiId, pose: { x: 1, y: 2, yaw: 0 }, metadata: { display_name: 'จุดประจำ' } }] };
HermesClient.prototype.inspectMap = async () => {
  if (unreadableMapReads > 0) { unreadableMapReads--; throw new Error('Grid replacement in progress'); }
  return { ...map, mappingEnabled: mapping, walls, capturedAt: new Date(Date.now()).toISOString() };
};
const { initWorld, getWorld } = await import('../src/db/memory');
const { createApp } = await import('../src/app');
const control = await import('../src/services/robotControlService');
const { getMotionSettings } = await import('../src/services/motionSettings');
const { beginMaintenance, setLocalizationRequired, setDockVerificationRequired, assertLocalizationConfirmed, assertDockVerified } = await import('../src/services/robotActivity');
const { createJob } = await import('../src/services/jobService');
const { acquireLock } = await import('../src/services/lockService');
const { hermes, pollHermes } = await import('../src/hermes/driver');
const { getDocument, putDocument } = await import('../src/services/documentStore');
const { getLiveMap, invalidateLiveMap } = await import('../src/services/liveMapService');
const { pendingStandbyReturn, cancelPendingStandbyReturn } = await import('../src/services/standbyReturnSchedule');
const { handleRobotAiCommand } = await import('../src/services/robotAiService');

test('real-device control contracts: limits, maps, localization, walls, standby and permissions', async t => {
  await initWorld({ demoMap: false }); await control.initializeRobotControl();
  const w = getWorld(); w.sim.lastTelemetryAt = Date.now();
  const server = createApp().listen(0); await new Promise<void>(r => server.once('listening', r));
  const address = server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}/api`;
  const login = await nativeFetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  assert.equal(login.status, 200);
  const headers = { cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  const request = (path: string, method = 'GET', body?: unknown) => nativeFetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await t.test('speed increase is verified, partial failure rolls back, and invalid input cannot write', async () => {
      const initialActions = actions;
      await control.applySpeed({ linearMps: 0.25, angularRps: 0.4 });
      assert.equal(linear, 0.25); assert.equal(getMotionSettings().linearMps, 0.25);
      rejectAngularOnce = true;
      await assert.rejects(control.applySpeed({ linearMps: 0.4, angularRps: 0.6 }), /rejected/);
      assert.equal(linear, 0.25); assert.equal(angular, 0.4); assert.equal(getMotionSettings().linearMps, 0.25);
      const count = calls.length;
      await assert.rejects(control.applySpeed({ linearMps: 9, angularRps: 0.3 }));
      assert.equal(calls.length, count); assert.equal(actions, initialActions);
      assert.equal((await request('/robot/speed', 'PUT', { linearMps: -1, angularRps: 0.3 })).status, 422);
    });
    await t.test('maintenance excludes motion, manual lock and concurrent edits', async () => {
      externalBusy = true;
      try { await assert.rejects(control.applySpeed({ linearMps: 0.2, angularRps: 0.3 }), /อุปกรณ์อื่น/); }
      finally { externalBusy = false; }
      const release = beginMaintenance(control.requireIdleRobot);
      try {
        await assert.rejects(createJob('X', 'operator', { id: 1, name: 'test' }, { target: { code: 'X', nameTh: 'X', x: 1, y: 1, headingDeg: 0, isDock: false, isPublic: false } }), /กำลังตั้งค่า/);
        assert.throws(() => acquireLock(w.users[0], 'manual'), /กำลังตั้งค่า/);
        await assert.rejects(control.applySpeed({ linearMps: 0.2, angularRps: 0.3 }), /กำลังตั้งค่า/);
      } finally { release(); }
      assert.equal(actions, 0);
    });
    await t.test('multiple STCM archives survive reinitialization, downloads preserve bytes and bad files are rejected', async () => {
      const a = await control.captureMap('อาคาร A'), b = await control.captureMap('อาคาร B');
      assert.notEqual(a.id, b.id); assert.equal((await control.listMapArchives()).length, 2);
      const download = await request(`/robot/map-archives/${a.id}/download`);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      await assert.rejects(control.storeArchive('bad', Buffer.from('not an stcm map at all'), 'upload'), /STCM/);
      await control.initializeRobotControl(); assert.equal(getMotionSettings().linearMps, 0.25);
      const result = await control.activateMap(a.id); assert.ok(result.backupId); assert.equal(result.needsLocalization, true);
      await control.initializeRobotControl();
      await assert.rejects(createJob('X', 'operator', { id: 1, name: 'test' }, { target: { code: 'X', nameTh: 'X', x: 1, y: 1, headingDeg: 0, isDock: false, isPublic: false } }), /ตำแหน่งและทิศ/);
      assert.equal(actions, 0);
      await control.confirmPose({ x: 0, y: 0, headingDeg: 90 });
      assert.ok(Math.abs(pose.yaw - Math.PI / 2) < 0.001);
      assert.equal((await getDocument<{ needsLocalization: boolean }>('robot-active-map', 'robot-binding'))!.needsLocalization, false);
      const blob = await getDocument<{ base64: string }>(b.id + ':blob', 'robot-map-blob');
      await putDocument(b.id + ':blob', 'robot-map-blob', { base64: 'broken' });
      await assert.rejects(control.archiveBytes(b.id), /ความถูกต้อง/);
      await putDocument(b.id + ':blob', 'robot-map-blob', blob);
    });
    await t.test('restore during exploration backs up before freezing, retries firmware reads and invalidates the displayed map', async () => {
      w.sim.lastTelemetryAt = Date.now();
      const archive = await control.captureMap('แผนที่สำหรับกู้คืน');
      mapping = true; invalidateLiveMap();
      assert.equal((await getLiveMap()).mappingEnabled, true);
      rejectBackup = true;
      let start = calls.length;
      try { await assert.rejects(control.activateMap(archive.id), /download/); }
      finally { rejectBackup = false; }
      assert.equal(mapping, true);
      assert.equal(calls.slice(start).filter(c => c.method !== 'GET').length, 0);
      start = calls.length; const actionCount = actions;
      unreadableMapReads = 2;
      const result = await control.activateMap(archive.id);
      assert.ok(result.backupId); assert.notEqual(result.backupId, archive.id);
      const ordered = calls.slice(start);
      const backup = ordered.findIndex(c => c.method === 'GET' && c.path.endsWith('/maps/stcm'));
      const freeze = ordered.findIndex(c => c.method === 'PUT' && c.path.endsWith('/mapping/:enable'));
      const upload = ordered.findIndex(c => c.method === 'PUT' && c.path.endsWith('/maps/stcm'));
      assert.ok(backup >= 0 && backup < freeze && freeze < upload);
      assert.equal(unreadableMapReads, 0); assert.equal(actions, actionCount);
      assert.equal((await getLiveMap()).mappingEnabled, false, 'old exploration snapshot must be discarded');
      assert.throws(assertLocalizationConfirmed);
      await control.confirmPose({ x: 0, y: 0, headingDeg: 0 });
    });
    await t.test('walls read back IDs, update and delete only the requested wall, mode changes never dispatch motion', async () => {
      const a = await control.writeWall({ start: { x: -1, y: 0 }, end: { x: -1, y: 1 } });
      const b = await control.writeWall({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 } });
      await control.writeWall({ start: { x: -1, y: 0 }, end: { x: -1, y: 2 } }, a.id);
      assert.equal(walls.find(w => w.id === a.id)!.end.y, 2);
      await hermes!.deleteWall(a.id); assert.deepEqual(walls.map(w => w.id), [b.id]);
      await assert.rejects(control.writeWall({ start: { x: 50, y: 0 }, end: { x: 50, y: 1 } }), /นอกแผนที่/);
      await control.applyOperatingMode('exploration'); assert.equal(mapping, true);
      await assert.rejects(control.writeWall({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 } }), /โหมดสร้างแผนที่/);
      await control.applyOperatingMode('normal'); assert.equal(mapping, false); assert.equal(actions, 0);
    });
    await t.test('standby returns once after arrival, never loops, and rejects a changed map', async () => {
      const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
      try {
      await control.configureStandby({ poiId, returnPolicy: 'after_job' });
      assert.equal(actions, 0, 'enabling the policy must not move immediately');
      w.sim.lastTelemetryAt = Date.now();
      await createJob('USER', 'operator', { id: w.users[0].id, name: 'test' }, { target: { code: 'USER', nameTh: 'user destination', x: 2, y: 2, headingDeg: 0, isDock: false, isPublic: false } });
      await pollHermes(); await control.maybeReturnToStandby();
      assert.equal(actions, 1, 'arrival must not return immediately');
      clock += 4999; w.sim.lastTelemetryAt = clock; await control.maybeReturnToStandby(); assert.equal(actions, 1);
      clock++; w.sim.lastTelemetryAt = clock; await control.maybeReturnToStandby();
      assert.equal(actions, 2); assert.equal(w.activeJob()?.source, 'auto');
      assert.equal(w.activeJob()?.destPoiCode, 'STANDBY:' + poiId);
      await pollHermes(); await control.maybeReturnToStandby(); assert.equal(actions, 2);
      map.cellsBase64 = Buffer.alloc(100, 126).toString('base64');
      await assert.rejects(control.returnToStandby({ id: 1, name: 'test' }), /แผนที่เปลี่ยน/);
      assert.equal(actions, 2);
      } finally { Date.now = realNow; w.sim.lastTelemetryAt = Date.now(); cancelPendingStandbyReturn(); }
    });
    await t.test('stop, disconnection and manual takeover cancel the waiting return permanently', async () => {
      const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
      const baseActions = actions;
      const arrive = async () => {
        w.sim.lastTelemetryAt = clock;
        await createJob('USER', 'operator', { id: w.users[0].id, name: 'test' }, { target: { code: 'USER', nameTh: 'user', x: 2, y: 2, headingDeg: 0, isDock: false, isPublic: false } });
        await pollHermes(); assert.ok(pendingStandbyReturn());
      };
      try {
        await control.configureStandby({ poiId, returnPolicy: 'after_job' });
        await arrive();
        await handleRobotAiCommand({ transcript: 'หยุด', dryRun: false }, { id: null, name: 'visitor' });
        assert.equal(pendingStandbyReturn(), null);
        clock += 6000; w.sim.lastTelemetryAt = clock; await control.maybeReturnToStandby(); assert.equal(actions, baseActions + 1);
        await arrive(); w.sim.lastTelemetryAt = clock - 6000;
        await control.maybeReturnToStandby(); assert.equal(pendingStandbyReturn(), null);
        clock += 6000; w.sim.lastTelemetryAt = clock; await control.maybeReturnToStandby(); assert.equal(actions, baseActions + 2);
        await arrive(); acquireLock(w.users[0], 'manual'); assert.equal(pendingStandbyReturn(), null);
        w.lock = null; w.sim.mode = 'idle'; clock += 6000; w.sim.lastTelemetryAt = clock;
        await control.maybeReturnToStandby(); assert.equal(actions, baseActions + 3);
        await arrive(); clock += 5000; w.sim.lastTelemetryAt = clock;
        await control.maybeReturnToStandby(); assert.equal(w.activeJob()?.source, 'auto');
        const stopped = await handleRobotAiCommand({ transcript: 'หยุด', dryRun: false }, { id: null, name: 'visitor' });
        assert.equal(stopped.rejected, false); assert.equal(w.activeJob(), undefined);
        clock += 6000; w.sim.lastTelemetryAt = clock;
        await control.maybeReturnToStandby(); assert.equal(actions, baseActions + 5, 'stopped standby return must never restart');
        await arrive(); clock += 5000; w.sim.lastTelemetryAt = clock;
        const inspect = hermes!.inspectMap;
        let releaseRead!: () => void, startedRead!: () => void;
        const blockedRead = new Promise<void>(resolve => { releaseRead = resolve; });
        const reading = new Promise<void>(resolve => { startedRead = resolve; });
        hermes!.inspectMap = async () => { startedRead(); await blockedRead; return inspect.call(hermes); };
        try {
          const returning = control.maybeReturnToStandby();
          await reading;
          await handleRobotAiCommand({ transcript: 'หยุด', dryRun: false }, { id: null, name: 'visitor' });
          releaseRead(); await returning;
          assert.equal(actions, baseActions + 6, 'stop during map verification must prevent delayed dispatch');
        } finally { releaseRead(); hermes!.inspectMap = inspect; }
        await control.configureStandby({ poiId, returnPolicy: 'manual' });
      } finally { cancelPendingStandbyReturn(); Date.now = realNow; w.sim.lastTelemetryAt = Date.now(); }
    });
    await t.test('unauthenticated writes and invalid archives cannot reach robot mutations', async () => {
      const count = calls.length;
      const r = await nativeFetch(base + '/robot/speed', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linearMps: 0.2, angularRps: 0.3 }) });
      assert.equal(r.status, 401);
      assert.equal((await request('/robot/map-archives/not-a-uuid/activate', 'POST', {})).status, 422);
      assert.equal(calls.length, count);
    });
    await t.test('clear map requires typed confirmation, admin role, idle state and a readable backup before robot changes', async () => {
      w.sim.lastTelemetryAt = Date.now();
      const count = calls.length;
      assert.equal((await request('/robot/map/clear', 'POST', { confirmation: 'yes' })).status, 422);
      const op = await nativeFetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'operator', password: 'operator123' }) });
      const denied = await nativeFetch(base + '/robot/map/clear', { method: 'POST', headers: { cookie: op.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'CLEAR MAP' }) });
      assert.equal(denied.status, 403); assert.equal(calls.length, count);
      w.lock = { robotId: w.robot().id, heldBy: w.users[0].id, mode: 'manual', acquiredAt: new Date().toISOString(), expiresAt: null };
      await assert.rejects(control.startNewMap({ confirmation: 'CLEAR MAP' }), /ปล่อยสิทธิ์/); w.lock = null;
      rejectBackup = true;
      const writesBefore = calls.filter(c => c.method !== 'GET').length;
      try { await assert.rejects(control.startNewMap({ confirmation: 'CLEAR MAP' }), /download/); }
      finally { rejectBackup = false; }
      assert.equal(clears, 0); assert.equal(calls.filter(c => c.method !== 'GET').length, writesBefore);
    });
    await t.test('partial clear failure retains a recoverable backup and durable navigation interlock', async () => {
      w.sim.lastTelemetryAt = Date.now(); rejectClear = true;
      try { await assert.rejects(control.startNewMap({ confirmation: 'CLEAR MAP' }), (error: any) => {
        assert.equal(error.code, 'map_clear_failed'); assert.ok(error.detail.backupId); return true;
      }); } finally { rejectClear = false; }
      const binding = await getDocument<{ resetBackupId: string; needsLocalization: boolean }>('robot-active-map', 'robot-binding');
      assert.equal(binding!.needsLocalization, true); assert.ok((await control.archiveBytes(binding!.resetBackupId)).bytes.length);
      assert.equal(mapping, false); assert.equal(clears, 0);
      await control.initializeRobotControl(); assert.throws(assertLocalizationConfirmed, /ตำแหน่งและทิศ/); assert.throws(assertDockVerified, /แท่นชาร์จ/);
      rejectBackup = true;
      try {
        const recovered = await control.activateMap(binding!.resetBackupId);
        assert.equal(recovered.hardwareApplied, true); assert.equal(recovered.needsLocalization, true);
        assert.throws(assertLocalizationConfirmed);
      } finally { rejectBackup = false; }
    });
    await t.test('clear starts fresh mapping, removes old artifacts and standby policy, and verifies the new dock separately', async () => {
      w.sim.lastTelemetryAt = Date.now();
      const actionCount = actions;
      const cleared = await request('/robot/map/clear', 'POST', { confirmation: 'CLEAR MAP' }); assert.equal(cleared.status, 200);
      const data = await cleared.json() as { backupId: string; mappingEnabled: boolean };
      assert.ok(data.backupId); assert.equal(data.mappingEnabled, true); assert.equal(mapping, true); assert.equal(clears, 1);
      assert.deepEqual(await hermes!.listPois(), []); assert.deepEqual(walls, []); assert.equal(actions, actionCount);
      const standby = await getDocument<{ poiId: string | null; returnPolicy: string }>('robot-standby', 'robot-standby');
      assert.equal(standby!.poiId, null); assert.equal(standby!.returnPolicy, 'manual');
      await control.initializeRobotControl(); assert.throws(assertLocalizationConfirmed); assert.throws(assertDockVerified);
      await assert.rejects(control.verifyNewMapDock({ confirmation: 'CONFIRM DOCK' }), /ให้พร้อม/);
      await control.applyOperatingMode('normal');
      await control.confirmPose({ x: 0, y: 0, headingDeg: 0 });
      assert.doesNotThrow(assertLocalizationConfirmed); assert.throws(assertDockVerified);
      map.home = { x: 0, y: 0, yaw: 0 };
      assert.equal((await control.verifyNewMapDock({ confirmation: 'CONFIRM DOCK' })).verified, true);
      assert.doesNotThrow(assertDockVerified);
    });
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); globalThis.fetch = nativeFetch; setLocalizationRequired(false); setDockVerificationRequired(false); }
});
