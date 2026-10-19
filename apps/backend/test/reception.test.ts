import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { initWorld, getWorld } from '../src/db/memory';
import { config } from '../src/config';
import { receptionEvents, createReception, authorizeReception, beginReceptionTurn, finishReceptionTurn, setReceptionMode } from '../src/services/receptionService';
import { streamKioskChat } from '../src/services/chatService';
import { libraryInput } from '../src/routes/mapLibrary';
import { handleKioskIntent } from '../src/services/aiService';
import { handleRobotAiCommand } from '../src/services/robotAiService';
import { WakeGate, extractWakeCommand, type ReceptionSession, type LibraryMap } from '@hermes/shared';

test('wake gating requires the phrase, expires after eight seconds, and accepts only one following command', () => {
  const gate = new WakeGate('hello hermes');
  assert.equal(gate.accept('take me to lobby', 100).command, null);
  assert.equal(gate.accept('hello hermes', 200).armed, true);
  assert.equal(gate.accept('take me to lobby', 300).command, 'take me to lobby');
  assert.equal(gate.accept('go to kitchen', 400).command, null);
  gate.accept('hello hermes', 500);
  assert.equal(gate.accept('go to kitchen', 8501).command, null);
  assert.equal(extractWakeCommand('hello hermesblah go', 'hello hermes'), null);
  assert.equal(extractWakeCommand('สวัสดีเฮอร์มีส พาไปห้องประชุม', 'สวัสดีเฮอร์มีส'), 'พาไปห้องประชุม');
  assert.equal(extractWakeCommand('someone said hello hermes go', 'hello hermes'), null);
});

test('navigation-only scope rejects unsupported transactions and ambiguous references without network or jobs', async () => {
  await initWorld();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Scope responses must not call a model, search or hardware'); };
  try {
    for (const text of ['เรียกแท็กซี่ให้หน่อย', 'ช่วยเรียกtaxiให้หน่อย', 'Book a taxi please', 'พาไปห้องนั้น', 'ไปที่นั่น', 'สวัสดี', 'อย่าพาไปห้อง 101']) {
      const chunks: string[] = [];
      await streamKioskChat({ lang: 'th', messages: [{ role: 'user', content: text }] }, e => { if (e.type === 'delta') chunks.push(e.text); }, new AbortController().signal);
      assert.ok(chunks.join('').length > 0, text);
      assert.equal(getWorld().jobs.length, 0, text);
    }
    assert.equal((await handleKioskIntent({ transcript: 'เรียกแท็กซี่ให้หน่อย', lang: 'th' })).rejected, true);
    assert.equal((await handleRobotAiCommand({ transcript: 'พาไปที่นั่น', lang: 'th' }, { id: null, name: 'test' })).rejected, true);
    assert.equal(getWorld().jobs.length, 0);
  } finally { globalThis.fetch = oldFetch; }
});

test('conversation capability is isolated and staff takeover aborts pending AI before changing mode', async () => {
  const a = await createReception(), b = await createReception();
  await assert.rejects(authorizeReception(a.session.id, b.token), /ไม่มีสิทธิ์/);
  const controller = new AbortController();
  beginReceptionTurn(a.session.id, controller);
  await setReceptionMode(a.session.id, 'staff', 1);
  assert.equal(controller.signal.aborted, true);
  await assert.rejects(setReceptionMode(a.session.id, 'ai', 2), /เจ้าหน้าที่อีกคน/);
  assert.equal((await authorizeReception(a.session.id, a.token)).mode, 'staff');
  finishReceptionTurn(a.session.id);
});

test('reception API logs full messages, restricts viewers, sends staff replies, and keeps two map libraries independent', async () => {
  await initWorld();
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const kiosk = { Authorization: `Bearer ${config.kioskToken}`, 'Content-Type': 'application/json' };
  const login = async (username: string, password: string) => {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    assert.equal(r.status, 200); return r.headers.get('set-cookie')!.split(';')[0];
  };
  const updates: unknown[] = [];
  const listener = (data: unknown) => updates.push(data);
  receptionEvents.on('update', listener);
  try {
    const admin = { Cookie: await login('admin', 'admin123'), 'Content-Type': 'application/json' };
    const viewer = { Cookie: await login('viewer', 'viewer123') };
    assert.equal((await fetch(base + '/api/ai/reception', { headers: viewer })).status, 403);
    const c = await (await fetch(base + '/api/kiosk/conversation', { method: 'POST', headers: kiosk, body: '{}' })).json() as { session: ReceptionSession; token: string };
    const path = `/api/kiosk/conversation/${c.session.id}`;
    assert.equal((await fetch(base + path, { headers: kiosk })).status, 403);
    const cap = { ...kiosk, 'x-conversation-token': c.token };
    const send = (content: string) => fetch(base + path + '/messages', { method: 'POST', headers: cap, body: JSON.stringify({ content, lang: 'th' }) });
    const text = await (await send('เรียกแท็กซี่ให้หน่อย')).text();
    assert.match(text, /ยังเรียกแท็กซี่/);
    let session = await (await fetch(base + path, { headers: cap })).json() as ReceptionSession;
    assert.deepEqual(session.messages.map((m: { role: string }) => m.role), ['user', 'assistant']);
    assert.equal(session.messages[1].status, 'complete');
    assert.equal('tokenHash' in session, false);
    const mode = await fetch(base + `/api/ai/reception/${c.session.id}/mode`, { method: 'POST', headers: admin, body: '{"mode":"staff"}' });
    assert.equal(mode.status, 200);
    await (await send('ช่วยดูแลหน่อย')).text();
    const reply = await fetch(base + `/api/ai/reception/${c.session.id}/messages`, { method: 'POST', headers: admin, body: JSON.stringify({ content: 'เจ้าหน้าที่กำลังไปช่วยครับ' }) });
    assert.equal(reply.status, 200);
    session = await (await fetch(base + path, { headers: cap })).json() as ReceptionSession;
    assert.deepEqual(session.messages.slice(-2).map((m: { role: string }) => m.role), ['user', 'staff']);
    assert.equal(session.messages.at(-1)?.content, 'เจ้าหน้าที่กำลังไปช่วยครับ');
    assert.ok(updates.length >= 4);
    assert.ok(updates.every(s => !('tokenHash' in (s as object))));
    const maps: LibraryMap[] = [];
    for (const name of ['ห้องแลป', 'ชั้นสอง']) {
      const r = await fetch(base + '/api/map-library', { method: 'POST', headers: admin, body: JSON.stringify({ name, widthM: 10, heightM: 10,
        pois: [{ code: 'WAIT', name: 'จุดประจำ', x: 2, y: 3 }], standbyCode: 'WAIT', returnPolicy: 'manual' }) });
      assert.equal(r.status, 201); maps.push(await r.json() as LibraryMap);
    }
    const selection = await fetch(base + `/api/map-library/${maps[1].id}/select`, { method: 'POST', headers: admin, body: '{}' });
    assert.equal((await selection.json() as { hardwareApplied: boolean }).hardwareApplied, false);
    const list = await (await fetch(base + '/api/map-library', { headers: admin })).json() as { maps: LibraryMap[]; selection: { id: string } };
    assert.equal(list.maps.length, 2); assert.equal(list.selection.id, maps[1].id);
    assert.notEqual(maps[0].id, maps[1].id);
    assert.equal(getWorld().jobs.length, 0);
    assert.equal((await fetch(base + '/api/map-library', { headers: viewer })).status, 403);
  } finally {
    receptionEvents.off('update', listener);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('library rejects unknown standby points, duplicate codes, and points outside the chosen map', () => {
  const valid = { name: 'A', widthM: 10, heightM: 10, pois: [{ code: 'A', name: 'A', x: 1, y: 2 }], standbyCode: 'A' };
  assert.equal(libraryInput.safeParse(valid).success, true);
  assert.equal(libraryInput.safeParse({ ...valid, standbyCode: 'MISSING' }).success, false);
  assert.equal(libraryInput.safeParse({ ...valid, pois: [...valid.pois, ...valid.pois] }).success, false);
  assert.equal(libraryInput.safeParse({ ...valid, pois: [{ ...valid.pois[0], x: -1 }] }).success, false);
  assert.equal(libraryInput.safeParse({ ...valid, standbyCode: null, returnPolicy: 'after_job' }).success, false);
});
