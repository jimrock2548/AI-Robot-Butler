// Real robot integration: only GET robot data and dryRun AI command previews.
// Safe chat cases below never request an executable movement or stop action.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const base = 'http://localhost:4000/api', proxy = 'http://localhost:3001/api/kiosk';
const status = await (await fetch(proxy + '/ai-status')).json();
assert.equal(status.simulated, false, 'This audit must use the real robot backend');
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
const get = async path => { const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(10000) }); assert.ok(r.ok, path); return r.json(); };
const before = await get('/robot/state'), map = await get('/robot/live-map');
const pois = map.pois.filter(p => p.metadata?.is_public !== false && p.metadata?.is_public !== 'false' && p.pose && typeof p.metadata?.display_name === 'string');
const poi = pois[0], name = poi?.metadata.display_name;
const session = await (await fetch(proxy + '/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
const cases = [
  ['สวัสดี', /สวัสดี/], ['ช่วยอะไรได้บ้าง', /นำทาง/], ['ขอบคุณ', /ยินดี/], ['ลาก่อน', /พบกัน/],
  ['มีจุดหมายอะไรบ้าง', pois.length ? new RegExp(name) : /ยังไม่มีจุดหมาย/],
  ['หุ่นแบตเหลือเท่าไหร่', before.linkStatus === 'ok' ? /แบตเตอรี่เหลือ.*%/ : /ยืนยัน.*ไม่ได้/],
  ['เรียกแท็กซี่ให้หน่อย', /ไม่ได้/], ['พาไปที่นั่น', /ระบุชื่อ/], ['อย่าพาไปห้องประชุม', /ไม่เริ่ม/],
  ['ห้องประชุมอยู่ชั้นไหน', /ไม่มีข้อมูลชั้น/], ['ห้องประชุมเปิดกี่โมง', /ไม่มีข้อมูลชั้นหรือเวลา/],
  ['ขอติดต่อเจ้าหน้าที่', /แจ้งรายละเอียด/],
  ...(poi ? [[`ห้อง${name}อยู่ไหน`, new RegExp(name)], [`ช่วยบอกตำแหน่งห้อง${name}หน่อย`, new RegExp(name)]] : []),
];
const results = [];
for (const [text, expected] of cases) {
  const started = Date.now();
  const response = await fetch(`${proxy}/conversation/${session.session.id}/messages`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-conversation-token': session.token }, body: JSON.stringify({ content: text, lang: 'th' }), signal: AbortSignal.timeout(30000) });
  const raw = await response.text();
  const events = raw.trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const answer = events.filter(e => e.type === 'delta').map(e => e.text).join('');
  const errors = events.filter(e => e.type === 'error').map(e => e.message);
  assert.ok(events.every(e => e.type !== 'done' || !e.job), 'A read-only chat unexpectedly dispatched a job');
  results.push({ text, kind: 'chat', answer, errors, passed: response.ok && errors.length === 0 && expected.test(answer), elapsedMs: Date.now() - started });
  console.log(JSON.stringify(results.at(-1)));
}
const previews = [
  ...(poi ? [[`ช่วยพาไปห้อง${name}หน่อย`, 'navigate_to', false], [`ห้อง${name}คือจุดหมายของผม ช่วยไปส่งหน่อย`, 'navigate_to', false]] : []),
  ['กลับจุดชาร์จ', 'return_to_dock', false], ['พาไปที่นั่น', 'unknown', true],
];
for (const [text, intent, rejected] of previews) {
  const started = Date.now();
  const response = await fetch(base + '/ai/command', { method: 'POST', headers, body: JSON.stringify({ transcript: text, lang: 'th', dryRun: true }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  assert.ok(!data.job, 'Dry-run must never dispatch a job');
  results.push({ text, kind: 'dry-run', result: data, elapsedMs: Date.now() - started,
    passed: response.ok && data.dryRun === true && data.intent === intent && data.rejected === rejected });
  console.log(JSON.stringify(results.at(-1)));
}
const after = await get('/robot/state');
const output = new URL('../reports/ai-fix-2026-10-21/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const summary = { date: new Date().toISOString(), realRobot: true, motionDispatched: false, status,
  robot: { linkStatus: after.linkStatus, poiCount: pois.length, localizationQuality: map.localizationQuality,
    mappingEnabled: map.mappingEnabled, jobBefore: before.currentJob?.id ?? null, jobAfter: after.currentJob?.id ?? null },
  passed: results.filter(r => r.passed).length, total: results.length, results };
await fs.writeFile(new URL('live-results.json', output), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed: summary.passed, total: summary.total, robot: summary.robot }));
