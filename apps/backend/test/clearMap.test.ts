import assert from 'node:assert/strict';
import test from 'node:test';
import { HermesClient } from '../src/hermes/hermesClient';

test('clear map accepts documented empty responses, then verifies the grid is gone without motion', async () => {
  const calls: string[] = [];
  const client = new HermesClient('http://robot.local', (async (_url, init) => {
    calls.push(init!.method!);
    return init?.method === 'DELETE' ? new Response(null, { status: 200 }) : new Response(null, { status: 404 });
  }) as typeof fetch, false);
  await client.clearMap(); assert.deepEqual(calls, ['DELETE', 'GET']);
  let attempts = 0;
  const readonly = new HermesClient('http://robot.local', (async () => { attempts++; return Response.json(true); }) as typeof fetch);
  await assert.rejects(readonly.clearMap(), /read-only/); assert.equal(attempts, 0);
});

test('clear map cannot claim success for a rejected clear or a retained known grid', async () => {
  const refused = new HermesClient('http://robot.local', (async () => Response.json(false)) as typeof fetch, false);
  await assert.rejects(refused.clearMap(), /rejected/);
  const grid = Buffer.alloc(37); grid.writeUInt32LE(1, 8); grid.writeUInt32LE(1, 12); grid.writeUInt32LE(1, 32); grid[36] = 127;
  const unchanged = new HermesClient('http://robot.local', (async (_url, init) => init?.method === 'DELETE' ? new Response(null, { status: 200 }) : new Response(new Uint8Array(grid))) as typeof fetch, false);
  await assert.rejects(unchanged.clearMap(), /not confirmed/);
});
