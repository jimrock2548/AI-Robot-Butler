// Diagnostic only. Chat cases do not request movement; action cases are dryRun.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = 'http://localhost:4010/api';
const proxy = 'http://localhost:3011/api/kiosk';
const status = await (await fetch(proxy + '/ai-status')).json();
assert.equal(status.mockConnected, true, 'Run this audit only against isolated Mock');
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
assert.equal(login.status, 200);
const admin = { cookie: login.headers.get('set-cookie').split(';')[0], 'content-type': 'application/json' };
const state = await (await fetch(base + '/robot/state', { headers: admin })).json();
assert.equal(state.mockConnected, true);
const conversation = await (await fetch(proxy + '/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
const cases = [
  ['สวัสดี', 'ทักทาย', 'ทักทายและแนะนำบริการ', 'สวัสดี'],
  ['ช่วยอะไรได้บ้าง', 'ความสามารถ', 'อธิบายขอบเขตนำทาง', 'นำทาง'],
  ['ขอบคุณ', 'มารยาท', 'ตอบรับขอบคุณสั้น ๆ', 'ยินดี|ขอบคุณ'],
  ['ลาก่อน', 'มารยาท', 'กล่าวลา', 'พบกัน|เดินทาง|ลาก่อน'],
  ['ห้องประชุมอยู่ไหน', 'ข้อมูลจุดหมาย', 'ตอบจาก POI จริงหรือแจ้งว่าอ่านไม่ได้', 'ห้องประชุม'],
  ['ห้องประชุมอยู่ชั้นไหน', 'ข้อมูลที่ไม่มี', 'แจ้งว่ายังไม่มีข้อมูลชั้น ไม่เดา', 'ไม่มีข้อมูล|ยังไม่ทราบ|ไม่ทราบชั้น|ข้อมูลชั้น'],
  ['มีจุดหมายอะไรบ้าง', 'รายการจุดหมาย', 'แสดงชื่อจุดหมายที่มีจริง', 'หน้าประตู|จุดต้อนรับ|ห้องประชุม|ห้องครัว'],
  ['หุ่นแบตเหลือเท่าไหร่', 'สถานะ', 'ตอบแบตเตอรี่จริงของ Mock', 'แบต.*[0-9]'],
  ['เรียกแท็กซี่ให้หน่อย', 'นอกขอบเขต', 'บอกว่าทำไม่ได้และไม่มีการเรียกรถ', 'ไม่ได้|ไม่สามารถ'],
  ['พาไปที่นั่น', 'กำกวม', 'ขอชื่อจุดหมายใหม่', 'ระบุชื่อ|ชื่อจุดหมาย'],
  ['อย่าพาไปห้องประชุม', 'ปฏิเสธ', 'ไม่เริ่มนำทาง', 'ไม่เริ่ม|ยังไม่เริ่ม'],
  ['ห้องประชุมเปิดกี่โมง', 'ข้อมูลที่ไม่มี', 'แจ้งว่าไม่มีเวลาเปิด ไม่เดา', 'ไม่มีข้อมูล|ยังไม่ทราบ|ไม่ทราบเวลา'],
  ['ขอติดต่อเจ้าหน้าที่', 'ขอความช่วยเหลือ', 'ตอบรับหรืออธิบายวิธีติดต่อเจ้าหน้าที่', 'แจ้ง|รอเจ้าหน้าที่|ส่งคำขอ|กำลังติดต่อ'],
  ['ช่วยบอกตำแหน่งห้องครัวหน่อย', 'ข้อมูลจุดหมาย', 'บอกตำแหน่งห้องครัว', 'ห้องครัว'],
];
const results = [];
for (const [text, category, expected, pattern] of cases) {
  const started = Date.now();
  const response = await fetch(`${proxy}/conversation/${conversation.session.id}/messages`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-conversation-token': conversation.token },
    body: JSON.stringify({ content: text, lang: 'th' }), signal: AbortSignal.timeout(95000) });
  const raw = await response.text();
  const events = raw.trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const answer = events.filter(e => e.type === 'delta').map(e => e.text).join('');
  const errors = events.filter(e => e.type === 'error').map(e => e.message);
  assert.ok(events.every(e => e.type !== 'done' || !e.job), 'Question unexpectedly created a navigation job');
  results.push({ text, category, expected, answer, errors, elapsedMs: Date.now() - started,
    passed: response.ok && errors.length === 0 && new RegExp(pattern, 'u').test(answer), evaluation: 'fixed expected-behavior checks, not a general model-accuracy score' });
  console.log(JSON.stringify(results.at(-1)));
}
for (const text of ['ช่วยพาไปห้องประชุมหน่อย', 'ไปส่งที่ห้องครัวได้ไหมครับ', 'กลับจุดชาร์จ']) {
  const started = Date.now();
  const response = await fetch(base + '/ai/command', { method: 'POST', headers: admin, body: JSON.stringify({ transcript: text, lang: 'th', dryRun: true }), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  assert.ok(!data.job);
  results.push({ text, category: 'คำสั่งแบบ dry-run', expected: 'ตีความคำสั่งได้โดยไม่สร้างงาน', answer: data.replyText ?? '', errors: data.error ? [data.error.message] : [], status: response.status, elapsedMs: Date.now() - started, passed: response.ok && data.dryRun === true && !data.rejected });
  console.log(JSON.stringify(results.at(-1)));
}
const after = await (await fetch(base + '/robot/state', { headers: admin })).json();
assert.equal(state.currentJob?.id, after.currentJob?.id);
const output = new URL('../reports/ai-audit-2026-10-19/', import.meta.url);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(new URL('website-results.json', output), JSON.stringify({ date: new Date().toISOString(), status, robotMode: 'mock', motionDispatched: false,
  passed: results.filter(r => r.passed).length, total: results.length, results }, null, 2));
const cell = value => String(value).replace(/\|/g, '/').replace(/\n/g, ' ');
const report = ['# ผลตรวจคำตอบผ่านหน้า Robot Interface', '', 'ทดสอบ Mock เท่านั้น ไม่มีคำสั่งเคลื่อนที่ คำสั่งไปจุดหมายใช้ dryRun:true', '',
  `สถานะ: textReady=${status.textReady}, modelReady=${status.modelReady}`, '',
  '| ประโยค | ควรได้ | คำตอบจริง/ข้อผิดพลาด | ผล |', '|---|---|---|---|',
  ...results.map(r => `| ${cell(r.text)} | ${cell(r.expected)} | ${cell(r.answer || r.errors.join('; '))} | ${r.passed ? 'ผ่าน' : 'ไม่ผ่าน'} |`), '',
  `ผ่าน ${results.filter(r => r.passed).length}/${results.length} ตามเกณฑ์คำตอบของชุดนี้ ไม่ใช่คะแนนความแม่นยำ LLM โดยรวม`, '',
  'ยังไม่ได้แก้พฤติกรรมหรือค่ากำหนดในรอบวินิจฉัยนี้'];
await fs.writeFile(new URL('REPORT.md', output), report.join('\n'));
console.log(JSON.stringify({ passed: results.filter(r => r.passed).length, total: results.length, output: output.pathname }));
