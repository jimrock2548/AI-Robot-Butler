import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ROBOT_MODE = 'mock';
process.env.DB_MODE = 'pg'; // Deliberately unsafe inherited settings must be isolated.
process.env.HERMES_BASE_URL = 'http://192.168.1.63:1448';
process.env.HERMES_AUTO_DOCK = 'true';
const { config } = await import('../src/config');
const { initWorld, getWorld } = await import('../src/db/memory');
const { hermes, pollHermes } = await import('../src/hermes/driver');
const { MockHermesClient } = await import('../src/hermes/mockHermesClient');
const { buildRobotState } = await import('../src/services/robotService');

test('connected mock forces isolated memory, exposes live fixtures, and never requests real hardware', async () => {
  assert.equal(config.dbMode, 'memory'); assert.equal(config.dock.enabled, false);
  assert.ok(hermes instanceof MockHermesClient);
  await initWorld({ demoMap: false });
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Network forbidden in this test'); };
  try {
    await pollHermes();
    const state = buildRobotState();
    assert.equal(state.simulated, true); assert.equal(state.mockConnected, true); assert.equal(state.linkStatus, 'ok');
    const first = await hermes.inspectMap();
    assert.equal(first.poiCount, 4); assert.equal(first.mappingEnabled, false);
    assert.equal(Buffer.from(first.cellsBase64, 'base64').length, first.width * first.height);
    assert.equal(first.laser?.laser_points.length, 360);
    const before = getWorld().sim.x;
    await hermes.moveTo(before + 1, getWorld().sim.y, null); await pollHermes();
    assert.ok(getWorld().sim.x > before);
    assert.equal((await hermes.inspectMap()).laser?.pose.x, getWorld().sim.x);
    await hermes.abort(); assert.equal(getWorld().sim.target, null);
    getWorld().sim.mode = 'manual';
    await hermes.moveBy(1, 0); await hermes.abort();
    assert.equal(getWorld().sim.mode, 'manual'); assert.equal(getWorld().sim.speed, 0);
    await hermes.emergencyStop(); assert.equal(getWorld().sim.mode, 'stopped');
    const originalNow = Date.now;
    try { Date.now = () => originalNow() + 6000; await hermes.sample(); assert.equal(getWorld().sim.mode, 'stopped'); }
    finally { Date.now = originalNow; }
    await hermes.clearEmergencyStop(); assert.equal(getWorld().sim.mode, 'idle');
    const poi = { id: 'test-poi', pose: { x: 2, y: 3, yaw: 0 }, metadata: { display_name: 'จุดทดสอบ', aliases: ['test'] } };
    await hermes.savePoi(poi); assert.equal((await hermes.listPois()).length, 5);
    await hermes.savePoi({ ...poi, metadata: { display_name: 'แก้ชื่อ' } }, true);
    assert.deepEqual((await hermes.listPois()).find(p => p.id === poi.id)?.metadata?.aliases, ['test']);
    await hermes.deletePoi(poi.id); assert.equal((await hermes.listPois()).length, 4);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = realFetch; }
});
