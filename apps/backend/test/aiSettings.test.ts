import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { config } from '../src/config';
import { initWorld, getWorld } from '../src/db/memory';
import { createApp } from '../src/app';
import { initializeAiSettings, readAiSettings } from '../src/services/aiSettings';
import { getDocument } from '../src/services/documentStore';
import { handleKioskIntent } from '../src/services/aiService';

test('AI scope is admin-only, validated, durable and immediately controls kiosk chat', async () => {
  await initWorld(); Object.assign(config.ai, { navigationOnly: true, mode: 'local' });
  await initializeAiSettings(); assert.equal(readAiSettings().navigationOnly, true);
  const server = createApp().listen(0); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const original = globalThis.fetch;
  let modelCalls = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.startsWith(config.ai.searxngUrl)) return Response.json({ results: [{ title: 'Source', url: 'https://example.com/', content: 'Test fact' }] });
    if (url.endsWith('/v1/models')) return Response.json({ data: [] });
    if (url.includes('/v1/chat/completions')) {
      modelCalls++;
      // Router JSON and streaming answer use the same endpoint.
      return modelCalls % 2 === 1
        ? Response.json({ choices: [{ message: { content: '{"route":"chat"}' } }] })
        : new Response('data: {"choices":[{"delta":{"content":"คำตอบทั่วไป"}}]}\n\ndata: [DONE]\n\n');
    }
    throw Error('Unexpected external request ' + url);
  };
  try {
    const cookies: Record<string, string> = {};
    for (const role of ['admin', 'operator', 'viewer']) {
      const r = await original(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: role, password: role + '123' }) });
      assert.equal(r.status, 200); cookies[role] = r.headers.get('set-cookie')!.split(';')[0];
    }
    const write = (body: unknown, role?: string) => original(base + '/ai/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(role ? { cookie: cookies[role] } : {}) }, body: JSON.stringify(body) });
    assert.equal((await original(base + '/ai/settings')).status, 401);
    assert.equal((await write({ navigationOnly: false })).status, 401);
    for (const role of ['operator', 'viewer']) assert.equal((await write({ navigationOnly: false }, role)).status, 403);
    for (const body of [{}, { navigationOnly: 'false' }, { navigationOnly: false, extra: true }]) assert.equal((await write(body, 'admin')).status, 422);
    assert.equal(readAiSettings().navigationOnly, true);
    const chat = async () => {
      const r = await original(base + '/kiosk/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.kioskToken}` }, body: JSON.stringify({ lang: 'th', messages: [{ role: 'user', content: 'ช่วยเขียนคำอวยพรวันเกิดหน่อย' }] }) });
      assert.equal(r.status, 200);
      return (await r.text()).trim().split('\n').map(line => JSON.parse(line));
    };
    let events = await chat(); assert.equal(events[0].route, 'database'); assert.equal(modelCalls, 0);
    assert.equal((await write({ navigationOnly: false }, 'admin')).status, 200);
    assert.deepEqual(await getDocument('ai-scope-settings', 'ai-settings'), { navigationOnly: false });
    await initializeAiSettings(); assert.equal(readAiSettings().navigationOnly, false, 'startup reload must preserve the saved setting over env');
    let classifications = 0;
    const classify = async () => { classifications++; return { intent: 'unknown' as const, confidence: 0.1, poiCode: null }; };
    await handleKioskIntent({ transcript: 'พาไปที่นั่น', lang: 'th' }, classify);
    assert.equal(classifications, 1, 'intent endpoint must use saved scope instead of env');
    let status = await original(base + '/kiosk/ai-status', { headers: { Authorization: `Bearer ${config.kioskToken}` } });
    assert.equal((await status.json() as any).navigationOnly, false);
    events = await chat(); assert.equal(events[0].route, 'chat'); assert.ok(events.some(e => e.type === 'delta' && e.text === 'คำตอบทั่วไป'));
    assert.equal((await write({ navigationOnly: true }, 'admin')).status, 200);
    await handleKioskIntent({ transcript: 'พาไปที่นั่น', lang: 'th' }, classify);
    assert.equal(classifications, 1, 'restricted intent must clarify before model inference');
    const count = modelCalls; events = await chat(); assert.equal(events[0].route, 'database'); assert.equal(modelCalls, count);
    assert.equal((await original(base + '/ai/status', { headers: { cookie: cookies.admin } }).then(r => r.json()) as any).navigationOnly, true);
    assert.equal(getWorld().jobs.length, 0);
  } finally { globalThis.fetch = original; server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
