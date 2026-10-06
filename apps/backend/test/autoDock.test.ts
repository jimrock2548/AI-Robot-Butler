import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initWorld } from '../src/db/memory';
import { maybeAutoDock } from '../src/services/jobService';

test('low battery creates one audited docking job', async () => {
  const world = await initWorld();
  world.sim.batteryPct = 14;
  maybeAutoDock();
  const job = world.activeJob();
  assert.equal(job?.source, 'auto');
  assert.equal(job?.destPoiCode, 'DOCK');
  assert.equal(world.sim.mode, 'docking');
  assert.ok(world.audit.some((entry) => entry.action === 'job.create' && entry.target === job.ref));
  maybeAutoDock();
  assert.equal(world.jobs.length, 1);
});
