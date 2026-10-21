import test from 'node:test';
import assert from 'node:assert/strict';
import { HermesClient } from '../src/hermes/hermesClient';

test('speed writes wait for firmware GET caches and never treat an old value as success', async () => {
  let linear = 0.1, angular = 0.3, pendingLinear = linear, pendingAngular = angular, remainingReads = 0;
  const client = new HermesClient('http://robot.local', (async (input, init) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      if (body.param === 'base.max_moving_speed') pendingLinear = Number(body.value); else pendingAngular = Number(body.value);
      remainingReads = 4; return Response.json(true);
    }
    if (remainingReads > 0) remainingReads--; else { linear = pendingLinear; angular = pendingAngular; }
    return Response.json(String(new URL(String(input)).searchParams.get('param') === 'base.max_moving_speed' ? linear : angular));
  }) as typeof fetch, false);
  await client.setMotionLimits(0.2, 0.5);
  assert.deepEqual(await client.getMotionLimits(), { linearMps: 0.2, angularRps: 0.5 });
  await client.configureMotionLimits(0.1, 0.3);
  assert.deepEqual(await client.getMotionLimits(), { linearMps: 0.1, angularRps: 0.3 });
});

test('a firmware false response cannot confirm a pose even if the old pose matches', async () => {
  let reads = 0;
  const client = new HermesClient('http://robot.local', (async (_input, init) => {
    if (init?.method === 'PUT') return Response.json(false);
    reads++; return Response.json({ x: 0, y: 0, yaw: 0 });
  }) as typeof fetch, false);
  await assert.rejects(client.setPose(0, 0, 0), /rejected pose/);
  assert.equal(reads, 0);
});
