import { test } from 'node:test';
import assert from 'node:assert/strict';

test('releasing manual control while limits are being verified prevents a delayed movement action', async () => {
  process.env.ROBOT_MODE = 'hermes';
  process.env.HERMES_READ_ONLY = 'false';
  const requests: string[] = [];
  let releaseParameter!: () => void;
  let parameterStarted!: () => void;
  const parameterGate = new Promise<void>((resolve) => { releaseParameter = resolve; });
  const started = new Promise<void>((resolve) => { parameterStarted = resolve; });
  const originalFetch = globalThis.fetch;
  let first = true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${init?.method} ${url.pathname}`);
    if (url.pathname.endsWith('/parameter')) {
      if (first) { first = false; parameterStarted(); await parameterGate; }
      return Response.json(url.searchParams.get('param') === 'base.max_moving_speed' ? '0.100000' : '0.300000');
    }
    return new Response(null, { status: 204 });
  };
  try {
    const { initWorld } = await import('../src/db/memory');
    const { pulseHermesManual } = await import('../src/hermes/driver');
    const { acquireLock } = await import('../src/services/lockService');
    const world = await initWorld();
    const admin = world.users.find((user) => user.role === 'admin')!;
    acquireLock(admin, 'manual');
    const movement = pulseHermesManual(1, 0, admin.id);
    await started;
    const stop = pulseHermesManual(0, 0, admin.id);
    releaseParameter();
    await Promise.all([movement, stop]);
    assert.ok(!requests.some((request) => request.startsWith('POST ')));
    assert.ok(requests.some((request) => request.startsWith('DELETE ')));
  } finally { releaseParameter(); globalThis.fetch = originalFetch; }
});
