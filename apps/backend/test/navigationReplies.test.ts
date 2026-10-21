import test from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, getWorld } from '../src/db/memory';
import { navigationReply } from '../src/services/navigationReplies';
import { streamKioskChat } from '../src/services/chatService';
import { classifyRobotTranscript } from '../src/services/robotIntent';
import { config } from '../src/config';
import { createApp } from '../src/app';
import type { AddressInfo } from 'node:net';

test('politeness, building questions and staff help receive distinct answers without model inference or motion', async () => {
  await initWorld();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('No model calls for these replies'); };
  const rows = [
    ['สวัสดี', /สวัสดี/], ['ขอบคุณมากครับ', /ยินดี/], ['ขอบคุณมากๆ ครับ', /ยินดี/], ['ลาก่อน', /พบกัน/],
    ['ช่วยอะไรได้บ้าง', /นำทาง/], ['ห้องประชุมอยู่ชั้นไหน', /ไม่มีข้อมูลชั้น/],
    ['ห้องประชุมเปิดกี่โมง', /ไม่มีข้อมูลชั้นหรือเวลา/], ['ขอติดต่อเจ้าหน้าที่', /แจ้งรายละเอียด/],
    ['Thank you', /welcome/], ['Goodbye', /Goodbye/], ['What floor is the meeting room on?', /not have verified floor/],
  ] as const;
  try {
    for (const [text, expected] of rows) {
      const lang = /^[a-z]/i.test(text) ? 'en' : 'th';
      const parts: string[] = [];
      await streamKioskChat({ messages: [{ role: 'user', content: text }], lang }, e => { if (e.type === 'delta') parts.push(e.text); }, new AbortController().signal);
      assert.match(parts.join(''), expected, text);
    }
    assert.equal(getWorld().jobs.length, 0);
  } finally { globalThis.fetch = original; }
});

test('destinations and location questions use public map data while an offline state never claims a fresh battery', async () => {
  await initWorld();
  const world = getWorld();
  const poi = world.publishedPois().find(p => p.isPublic)!;
  assert.ok(poi);
  const listing = await navigationReply('มีจุดหมายอะไรบ้าง', 'th');
  assert.ok(listing?.includes(poi.nameTh));
  const location = await navigationReply(`ช่วยบอกตำแหน่ง${poi.nameTh}หน่อย`, 'th');
  assert.ok(location?.includes(poi.x.toFixed(2)));
  assert.ok(location?.includes(poi.nameTh));
  assert.equal(await navigationReply(`พาไป${poi.nameTh}`, 'th'), null);
  world.sim.lastTelemetryAt = 0;
  assert.match((await navigationReply('หุ่นแบตเหลือเท่าไหร่', 'th'))!, /ยืนยัน.*ไม่ได้/);
  world.sim.lastTelemetryAt = Date.now();
  assert.match((await navigationReply('หุ่นแบตเหลือเท่าไหร่', 'th'))!, /แบตเตอรี่เหลือ.*%/);
  assert.equal(world.jobs.length, 0);
});

test('model navigation without a resolved POI is downgraded to clarification even at high confidence', async () => {
  const oldMode = config.ai.mode, original = globalThis.fetch;
  Object.assign(config.ai, { mode: 'local' });
  const catalog = [{ code: 'a', nameTh: 'ห้องประชุม', nameEn: 'meeting room' }];
  let output = { intent: 'navigate_to', confidence: 0.99, poiCode: null as string | null, speechAct: 'request', needsClarification: false };
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
  try {
    const missing = await classifyRobotTranscript({ transcript: 'พาไปที่นั่น', lang: 'th' }, undefined, catalog, 'model');
    assert.equal(missing.intent, 'unknown'); assert.equal(missing.needsClarification, true);
    output = { ...output, poiCode: 'a' };
    const guessed = await classifyRobotTranscript({ transcript: 'พาไปที่นั่น', lang: 'th' }, undefined, catalog, 'model');
    assert.equal(guessed.intent, 'unknown'); assert.equal(guessed.poiCode, null);
    const clear = await classifyRobotTranscript({ transcript: 'พาไปห้องประชุม', lang: 'th' }, undefined, catalog, 'model');
    assert.equal(clear.intent, 'navigate_to'); assert.equal(clear.poiCode, 'a');
  } finally { globalThis.fetch = original; Object.assign(config.ai, { mode: oldMode }); }
});

test('basic destination rules work with AI_MODE=off, while readiness explicitly reports rules-only', async () => {
  await initWorld();
  const original = globalThis.fetch;
  const mode = config.ai.mode;
  Object.assign(config.ai, { mode: 'off' });
  const catalog = [{ code: 'a', nameTh: 'ห้องประชุม', nameEn: 'meeting room' }];
  const decision = await classifyRobotTranscript({ transcript: 'พาไปห้องประชุม', lang: 'th' }, undefined, catalog);
  assert.equal(decision.intent, 'navigate_to'); assert.equal(decision.decisionSource, 'rules');
  await assert.rejects(classifyRobotTranscript({ transcript: 'รบกวนไปส่งผม', lang: 'th' }, undefined, catalog, 'model'), /ต้องใช้โมเดล/);
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/kiosk/ai-status`;
    // Prevent an optional SearXNG network check; retain loopback API access.
    globalThis.fetch = async (input, init) => String(input) === url ? original(input, init) : Response.json({}, { status: 503 });
    const data = await (await fetch(url, { headers: { Authorization: `Bearer ${config.kioskToken}` } })).json() as { rulesReady: boolean; modelReady: boolean; readiness: string };
    assert.equal(data.rulesReady, true); assert.equal(data.modelReady, false); assert.equal(data.readiness, 'rules-only');
    globalThis.fetch = original;
    const response = await fetch(url.replace('/ai-status', '/chat'), { method: 'POST', headers: { Authorization: `Bearer ${config.kioskToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: 'th', messages: [{ role: 'user', content: 'ขอบคุณ' }] }) });
    assert.equal(response.status, 200); assert.match(await response.text(), /ยินดี/);
  } finally {
    globalThis.fetch = original; Object.assign(config.ai, { mode });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
