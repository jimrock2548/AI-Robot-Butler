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
  const client = new HermesClient('http://robot.local:1448', fetcher as typeof fetch, false);
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

test('read-only hardware never sends mutation requests, including startup abort and emergency stop', async () => {
  let requests = 0;
  const client = new HermesClient('http://robot.local:1448', (async () => {
    requests++;
    return new Response('{}');
  }) as typeof fetch);
  await assert.rejects(client.moveTo(1, 2, null), /read-only/);
  await assert.rejects(client.goHome(), /read-only/);
  await assert.rejects(client.moveBy(1, 0), /read-only/);
  await assert.rejects(client.abort(), /read-only/);
  await assert.rejects(client.emergencyStop(), /read-only/);
  assert.equal(requests, 0);
});

test('firmware without the speed endpoint still provides battery and pose with unknown speed', async () => {
  const client = new HermesClient('http://robot.local:1448', (async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/speed')) return new Response('', { status: 404 });
    if (path.endsWith('/power/status')) return Response.json({ batteryPercentage: 100 });
    if (path.endsWith('/localization/pose')) return Response.json({ x: -0.2, y: 0, yaw: 0 });
    return new Response('', { status: 404 });
  }) as typeof fetch);
  const sample = await client.sample();
  assert.equal(sample.speedMps, null);
  assert.equal(sample.batteryPct, 100);
  assert.equal(sample.x, -0.2);
});

test('lab speed limits must be acknowledged and read back before being considered verified', async () => {
  const values = new Map([['base.max_moving_speed', 0.7], ['base.max_angular_speed', 1.2]]);
  const requests: string[] = [];
  const client = new HermesClient('http://robot.local:1448', (async (input, init) => {
    const url = new URL(String(input));
    requests.push(init!.method!);
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      values.set(body.param, Number(body.value));
      return Response.json(true);
    }
    return Response.json(String(values.get(url.searchParams.get('param')!)));
  }) as typeof fetch, false);
  await client.configureMotionLimits(0.1, 0.3);
  assert.equal(values.get('base.max_moving_speed'), 0.1);
  assert.equal(values.get('base.max_angular_speed'), 0.3);
  assert.equal(requests.filter((method) => method === 'PUT').length, 2);
  const refused = new HermesClient('http://robot.local:1448', (async (_input, init) =>
    Response.json(init?.method === 'PUT' ? false : '0.7')) as typeof fetch, false);
  await assert.rejects(refused.configureMotionLimits(0.1, 0.3), /rejected/);
});
