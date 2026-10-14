import assert from 'node:assert/strict';
import test from 'node:test';
import { HermesClient } from '../src/hermes/hermesClient';
import type { RobotPoi } from '@hermes/shared';

test('robot POI writes read back, retain existing metadata, and delete only the specified point without motion', async () => {
  let pois: RobotPoi[] = [];
  const calls: { path: string; method: string }[] = [];
  const client = new HermesClient('http://robot.local', (async (url, init) => {
    const path = new URL(String(url)).pathname, method = init?.method ?? 'GET';
    calls.push({ path, method });
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (method === 'POST' || method === 'PUT') {
      assert.ok(Object.values(body.metadata).every(value => typeof value === 'string'),
        'firmware metadata must contain only strings');
    }
    if (method === 'POST') { pois.push(body); return new Response(null, { status: 200 }); }
    if (method === 'PUT') pois = pois.map(p => path.endsWith(p.id) ? { ...p, ...body } : p);
    if (method === 'DELETE') pois = pois.filter(p => !path.endsWith(p.id));
    return new Response(JSON.stringify(method === 'GET' ? pois : true));
  }) as typeof fetch, false);
  const a = { id: 'a', pose: { x: -2, y: 3, yaw: Math.PI / 2 }, metadata: { display_name: 'A', custom: 'preserved' } };
  await client.savePoi(a);
  await client.savePoi({ ...a, id: 'b' });
  const updated = await client.savePoi({ ...a, metadata: { display_name: 'New A', aliases: ['ทางเข้า', 'entrance'] } }, true);
  assert.equal(updated.metadata?.custom, 'preserved');
  assert.deepEqual(updated.metadata?.aliases, ['ทางเข้า', 'entrance']);
  assert.equal(pois[0].metadata?.aliases, '["ทางเข้า","entrance"]');
  await client.deletePoi('a');
  assert.deepEqual(pois.map(p => p.id), ['b']);
  assert.ok(calls.every(call => call.path.startsWith('/api/core/artifact/v1/pois')));
});

test('creating a POI with empty aliases sends string metadata and reads aliases back as an array', async () => {
  let stored: RobotPoi | null = null;
  let writes = 0;
  const client = new HermesClient('http://robot.local', (async (_url, init) => {
    if (init?.method === 'POST') {
      writes++;
      stored = JSON.parse(String(init.body));
      assert.equal(stored!.metadata?.aliases, '[]');
      assert.ok(Object.values(stored!.metadata!).every(value => typeof value === 'string'));
      return new Response(null, { status: 200 });
    }
    assert.equal(init?.method, 'GET');
    return Response.json([stored]);
  }) as typeof fetch, false);
  const saved = await client.savePoi({ id: 'a', pose: { x: 1, y: 2, yaw: 0 },
    metadata: { display_name: 'ห้องประชุม', type: 'poi', aliases: [] } });
  assert.deepEqual(saved.metadata?.aliases, []);
  assert.equal(writes, 1);
});

test('robot ignoring alias metadata cannot report a verified save', async () => {
  const poi = { id: 'a', pose: { x: 1, y: 1, yaw: 0 }, metadata: { display_name: 'A', aliases: ['entrance'] } };
  const client = new HermesClient('http://robot.local', (async (_url, init) => new Response(JSON.stringify(init?.method === 'GET' ? [{ ...poi, metadata: { display_name: 'A' } }] : true))) as typeof fetch, false);
  await assert.rejects(() => client.savePoi(poi), /could not be verified/);
});

test('unconfirmed POI writes, rejected deletion and readonly mutations cannot report success', async () => {
  const client = new HermesClient('http://robot.local', (async (_url, init) => new Response(init?.method === 'GET' ? '[]' : 'false')) as typeof fetch, false);
  await assert.rejects(client.savePoi({ id: 'a', pose: { x: 0, y: 0, yaw: 0 } }), /rejected/);
  await assert.rejects(client.deletePoi('a'), /rejected/);
  let writes = 0;
  const readonly = new HermesClient('http://robot.local', (async (_url, init) => { if (init?.method !== 'GET') writes++; return new Response('[]'); }) as typeof fetch);
  await assert.rejects(readonly.savePoi({ id: 'a' }), /read-only/);
  await assert.rejects(readonly.deletePoi('a'), /read-only/);
  assert.equal(writes, 0);
  const unconfirmed = new HermesClient('http://robot.local', (async (_url, init) => new Response(init?.method === 'GET' ? '[]' : 'true')) as typeof fetch, false);
  await assert.rejects(unconfirmed.savePoi({ id: 'a', pose: { x: 0, y: 0, yaw: 0 } }), /could not be verified/);
});
