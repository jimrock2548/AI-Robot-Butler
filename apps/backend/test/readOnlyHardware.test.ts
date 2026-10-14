import { test } from 'node:test';
import assert from 'node:assert/strict';

test('read-only hardware polling skips startup abort and auto-dock, and services reject control', async () => {
  process.env.ROBOT_MODE = 'hermes';
  process.env.HERMES_READ_ONLY = 'true';
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    requests.push(`${init?.method ?? 'GET'} ${path}`);
    assert.equal(init?.method, 'GET', 'Observation must never write to robot hardware');
    if (path.endsWith('/power/status')) return Response.json({ batteryPercentage: 10 });
    if (path.endsWith('/localization/pose')) return Response.json({ x: 0, y: 0, yaw: 0 });
    if (path.endsWith('/runtime')) return Response.json(60);
    return new Response('', { status: 404 });
  };
  try {
    const { initWorld } = await import('../src/db/memory');
    const { pollHermes, pulseHermesManual } = await import('../src/hermes/driver');
    const { maybeAutoDock, createJob, estop } = await import('../src/services/jobService');
    const { acquireLock } = await import('../src/services/lockService');
    const { buildRobotState } = await import('../src/services/robotService');
    const world = await initWorld();
    await pollHermes();
    const readRequests = requests.length;
    await maybeAutoDock();
    assert.equal(world.activeJob(), undefined);
    assert.equal(buildRobotState().commandsEnabled, false);
    assert.equal(buildRobotState().telemetry?.speedMps, null);
    const admin = world.users.find((user) => user.role === 'admin')!;
    assert.throws(() => acquireLock(admin, 'manual'), /โหมดอ่านอย่างเดียว/);
    await assert.rejects(createJob('DOCK', 'operator', { id: admin.id, name: admin.displayName }), /โหมดอ่านอย่างเดียว/);
    await assert.rejects(estop(admin), /โหมดอ่านอย่างเดียว/);
    await assert.rejects(pulseHermesManual(1, 0), /read-only/);
    assert.equal(requests.length, readRequests);
    assert.equal(requests.length, 4);
    assert.ok(requests.every((request) => request.startsWith('GET ')));
  } finally { globalThis.fetch = originalFetch; }
});
