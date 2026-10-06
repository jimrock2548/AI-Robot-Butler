import assert from 'node:assert/strict';
import test from 'node:test';
import { HermesClient } from '../src/hermes/hermesClient';

test('Hermes REST telemetry maps pose radians and battery into the dashboard sample', async () => {
  const replies: Record<string, unknown> = {
    '/api/core/system/v1/power/status': { batteryPercentage: 73 },
    '/api/core/slam/v1/localization/pose': { x: 4.25, y: 7, yaw: Math.PI / 2 },
    '/api/core/motion/v1/speed': { vx: 0.3, vy: 0 },
    '/api/core/statistics/v1/runtime': 1234,
  };
  const fetcher = async (url: string | URL | Request) =>
    new Response(JSON.stringify(replies[new URL(String(url)).pathname]), { status: 200 });
  const client = new HermesClient('http://robot.local:1448', fetcher as typeof fetch);
  const sample = await client.sample();
  assert.equal(sample.batteryPct, 73);
  assert.equal(sample.headingDeg, 90);
  assert.equal(sample.speedMps, 0.3);
  assert.equal(sample.uptimeSec, 1234);
});

test('Hermes REST commands use documented actions and reject unconfirmed E-Stop', async () => {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ method: init?.method ?? 'GET', path: new URL(String(url)).pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(requests.at(-1)?.path.endsWith('/parameter') ? 'false' : '{"action_id":42}', { status: 200 });
  };
  const client = new HermesClient('http://robot.local:1448', fetcher as typeof fetch);
  assert.equal((await client.moveTo(1, 2, 90)).action_id, 42);
  assert.deepEqual(requests[0].body, {
    action_name: 'slamtec.agent.actions.MoveToAction',
    options: { target: { x: 1, y: 2, z: 0 }, move_options: { mode: 0, flags: ['with_yaw'], yaw: Math.PI / 2 } },
  });
  await client.goHome();
  assert.equal((requests[1].body as any).action_name, 'slamtec.agent.actions.GoHomeAction');
  await client.moveBy(1, 0);
  assert.deepEqual((requests[2].body as any).options, { direction: 0, duration: 200 });
  await assert.rejects(client.emergencyStop(), /rejected emergency stop/);
});
