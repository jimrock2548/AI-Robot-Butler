import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveRobotMap } from '@hermes/shared';

process.env.ROBOT_MODE = 'hermes';
process.env.HERMES_READ_ONLY = 'false';
process.env.AI_MODE = 'local';
const realFetch = globalThis.fetch;
const mutations: { method: string; path: string; body: any }[] = [];
const poiId = '12345678-1234-4234-8234-123456789012';
globalThis.fetch = (async (url, init) => {
  const path = new URL(String(url)).pathname;
  if (path === '/v1/chat/completions') return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: 'navigate_to', confidence: 0.99, poiCode: poiId, speechAct: 'request', needsClarification: false }) } }] }));
  if (path === '/api/core/system/v1/parameter') return new Response('"0.100000"');
  if (init?.method !== 'GET') mutations.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path === '/api/core/motion/v1/actions' && init?.method === 'POST') return new Response('{"action_id":12}');
  if (path === '/api/core/motion/v1/actions/:current' && init?.method === 'DELETE') return new Response(null, { status: 204 });
  throw new Error(`Unexpected mocked request: ${path}`);
}) as typeof fetch;

const { HermesClient } = await import('../src/hermes/hermesClient');
const map: LiveRobotMap = { x: -3, y: -3, width: 100, height: 100, resolution: 0.1,
  cellsBase64: Buffer.alloc(10000, 127).toString('base64'), capturedAt: new Date().toISOString(),
  home: { x: -1, y: 0, yaw: 0 }, localizationQuality: 85, mappingEnabled: false,
  modelName: null, softwareVersion: null, dockingStatus: null, poiCount: 2,
  pois: [
    { id: poiId, pose: { x: 1, y: 2, yaw: Math.PI / 2 }, metadata: { display_name: 'หน้าประตู' } },
    { id: '12345678-1234-4234-8234-123456789013', pose: { x: 0, y: 1, yaw: 0 }, metadata: { display_name: 'ห้องส่วนตัว', is_public: false } },
  ] };
HermesClient.prototype.inspectMap = async () => ({ ...map, pois: map.pois ?? [], laser: null, capturedAt: new Date().toISOString() });
const { createApp } = await import('../src/app');
const { initWorld, getWorld } = await import('../src/db/memory');
const { config } = await import('../src/config');

test('authenticated kiosk chat dispatches a robot POI, GET session never stops motion, and kiosk cannot cancel an operator job', async () => {
  await initWorld({ demoMap: false });
  const w = getWorld(); w.sim.lastTelemetryAt = Date.now();
  const server = createApp().listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/kiosk`;
  const headers = { Authorization: `Bearer ${config.kioskToken}`, 'Content-Type': 'application/json' };
  try {
    const anonymous = await realFetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(anonymous.status, 401);
    const destinations = await (await realFetch(base + '/destinations', { headers })).json() as { items: { code: string }[] };
    assert.deepEqual(destinations.items.map(p => p.code), [poiId]);
    const response = await realFetch(base + '/chat', { method: 'POST', headers, body: JSON.stringify({ lang: 'th', messages: [{ role: 'user', content: 'หน้าประตูคือจุดหมายของผม คุณช่วยไปส่งผมที่นั่นได้ไหม' }] }) });
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    const job = events.find(event => event.type === 'done')?.job;
    assert.equal(job?.source, 'kiosk_voice'); assert.equal(job?.destPoiCode, poiId);
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].body.action_name, 'slamtec.agent.actions.MoveToAction');
    assert.equal(mutations[0].body.options.target.x, 1);
    assert.equal(mutations[0].body.options.move_options.yaw, Math.PI / 2);
    const session = await realFetch(`${base}/session/${job.id}`, { headers });
    assert.equal(session.status, 200); assert.equal((await session.json() as any).job.id, job.id);
    assert.equal(mutations.length, 1, 'GET session must never dispatch any hardware mutation');
    w.activeJob()!.source = 'operator';
    const refused = await realFetch(base + '/cancel', { method: 'POST', headers, body: '{}' });
    assert.equal(refused.status, 409); assert.equal(mutations.length, 1);
    w.activeJob()!.source = 'kiosk_voice';
    const stopped = await realFetch(base + '/cancel', { method: 'POST', headers, body: '{}' });
    assert.equal(stopped.status, 200); assert.equal(w.activeJob(), undefined);
    assert.equal(mutations[1].method, 'DELETE');
  } finally { server.close(); globalThis.fetch = realFetch; }
});
