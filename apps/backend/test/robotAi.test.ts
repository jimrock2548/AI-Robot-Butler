import assert from 'node:assert/strict';
import test from 'node:test';
import { initWorld, getWorld } from '../src/db/memory';
import { handleRobotAiCommand } from '../src/services/robotAiService';
import type { AiDecision } from '../src/services/aiService';
import type { LiveRobotMap } from '@hermes/shared';

const map: LiveRobotMap = { x: -3, y: -3, width: 100, height: 100, resolution: 0.1, cellsBase64: '',
  capturedAt: new Date().toISOString(), home: { x: -1, y: 0, yaw: 0 }, localizationQuality: 85,
  mappingEnabled: false, modelName: null, softwareVersion: null, dockingStatus: null, poiCount: 1,
  pois: [{ id: 'robot-poi-1', pose: { x: 1, y: 2, yaw: 0.5 }, metadata: { display_name: 'โต๊ะแลป' } }] };
const requester = { id: 1, name: 'Admin AI' };
const choose = (decision: AiDecision) => ({ loadMap: async () => map, classify: async () => decision });

test('model cannot substitute the charger for a named POI request', async () => {
  await initWorld(); getWorld().sim.lastTelemetryAt = Date.now();
  const result = await handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป', dryRun: true }, requester, undefined,
    choose({ intent: 'return_to_dock', confidence: 1, poiCode: null, speechAct: 'request' }));
  assert.equal(result.rejected, true); assert.equal(result.needsClarification, true); assert.equal(getWorld().jobs.length, 0);
});

test('operator AI uses robot POI IDs, dry-run cannot create jobs, unknown and uncertain destinations are rejected', async () => {
  await initWorld();
  const w = getWorld(); w.sim.lastTelemetryAt = Date.now();
  const preview = await handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป', dryRun: true }, requester, undefined, {
    loadMap: async () => map,
    classify: async (_raw, _signal, catalog) => {
      assert.deepEqual(catalog?.map(p => p.code), ['robot-poi-1']);
      return { intent: 'navigate_to', confidence: 0.99, poiCode: 'robot-poi-1' };
    },
  });
  assert.equal(preview.target?.x, 1); assert.equal(preview.dryRun, true); assert.equal(w.jobs.length, 0);
  const unknown = await handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป' }, requester, undefined, choose({ intent: 'navigate_to', confidence: 0.99, poiCode: 'invented' }));
  assert.equal(unknown.rejected, true); assert.equal(w.jobs.length, 0);
  const uncertain = await handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป' }, requester, undefined, choose({ intent: 'navigate_to', confidence: 0.3, poiCode: 'robot-poi-1' }));
  assert.equal(uncertain.rejected, true); assert.equal(w.jobs.length, 0);
});

test('questions and negated movement cannot dispatch even if the model proposes movement; explicit command creates and stops a simulated job', async () => {
  await initWorld();
  const w = getWorld(); w.sim.lastTelemetryAt = Date.now();
  const classifier = choose({ intent: 'navigate_to', confidence: 1, poiCode: 'robot-poi-1' });
  for (const transcript of ['โต๊ะแลปอยู่ไหน', 'อย่าไปโต๊ะแลป', 'ไปโต๊ะแลป ถ้าฉันสั่ง', 'อ่านคำว่า “พาไปโต๊ะแลป”']) {
    assert.equal((await handleRobotAiCommand({ transcript }, requester, undefined, classifier)).rejected, true);
  }
  assert.equal(w.jobs.length, 0);
  const run = await handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป' }, requester, undefined, classifier);
  assert.equal(run.job?.source, 'operator'); assert.equal(w.activeJob()?.destPoiCode, 'robot-poi-1');
  const stop = await handleRobotAiCommand({ transcript: 'หยุด' }, requester, undefined, { loadMap: async () => { throw new Error('Stop must not wait for map'); }, classify: async () => { throw new Error('Stop must not wait for model'); } });
  assert.equal(stop.rejected, false); assert.equal(w.activeJob(), undefined);
});

test('stop invalidates a pending model result so it cannot trigger a delayed navigation', async () => {
  await initWorld(); getWorld().sim.lastTelemetryAt = Date.now();
  const originalJobs = getWorld().jobs.length;
  let release!: (value: AiDecision) => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const pending = handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป' }, requester, undefined, {
    loadMap: async () => map,
    classify: async () => { entered(); return new Promise(resolve => { release = resolve; }); },
  });
  await ready;
  await handleRobotAiCommand({ transcript: 'หยุด' }, requester);
  release({ intent: 'navigate_to', confidence: 1, poiCode: 'robot-poi-1' });
  await assert.rejects(pending, /ถูกยกเลิก/);
  assert.equal(getWorld().jobs.length, originalJobs);
});

test('dock preview uses saved home pose and a location question does not start motion', async () => {
  await initWorld();
  const originalJobs = getWorld().jobs.length;
  const dock = await handleRobotAiCommand({ transcript: 'กลับจุดชาร์จ', dryRun: true }, requester, undefined, choose({ intent: 'return_to_dock', confidence: 1, poiCode: null }));
  assert.equal(dock.target?.x, -1); assert.equal(getWorld().jobs.length, originalJobs);
  const location = await handleRobotAiCommand({ transcript: 'โต๊ะแลปอยู่ไหน' }, requester, undefined, choose({ intent: 'where_is', confidence: 1, poiCode: 'robot-poi-1' }));
  assert.equal(location.rejected, false); assert.equal(getWorld().jobs.length, originalJobs);
});

test('a POI deleted during inference cannot dispatch cached coordinates', async () => {
  await initWorld(); getWorld().sim.lastTelemetryAt = Date.now();
  const originalJobs = getWorld().jobs.length;
  let reads = 0;
  const result = await handleRobotAiCommand({ transcript: 'พาไปโต๊ะแลป' }, requester, undefined, {
    loadMap: async () => ++reads === 1 ? map : { ...map, pois: [] },
    classify: async () => ({ intent: 'navigate_to', confidence: 1, poiCode: 'robot-poi-1' }),
  });
  assert.equal(result.rejected, true);
  assert.equal(getWorld().jobs.length, originalJobs);
});
