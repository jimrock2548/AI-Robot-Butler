// Every AI command is explicitly dryRun:true. This script must never move the robot.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter(line => line.includes('=') && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const base = 'http://localhost:4000/api';
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: env.INITIAL_ADMIN_PASSWORD }) });
if (!login.ok) throw new Error(`Login: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];
async function get(path) {
  const response = await fetch(base + path, { headers: { cookie } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}
const status = await get('/ai/status');
console.log(JSON.stringify(status));
if (!status.modelReady) throw new Error('Local model not ready');
const before = await get('/robot/state');
const map = await get('/robot/live-map');
const poi = map.pois?.find(p => typeof p.metadata?.display_name === 'string');
const requests = [
  ['กลับจุดชาร์จ', 'return_to_dock'],
  ['แบตเหลือเท่าไหร่', 'robot_status'],
  ['หยุด', 'cancel_job'],
  ...(poi ? [[`พาไป${poi.metadata.display_name}`, 'navigate_to']] : [['พาไปจุดทดสอบที่ไม่มีอยู่', 'unknown']]),
];
for (const [transcript, expected] of requests) {
  const started = Date.now();
  const response = await fetch(`${base}/ai/command`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript, lang: 'th', dryRun: true }) });
  const result = await response.json();
  console.log(JSON.stringify({ transcript, elapsedMs: Date.now() - started, status: response.status, ...result }));
  if (!response.ok || !result.dryRun || result.job || result.intent !== expected) throw new Error(`Preview failed: ${transcript}`);
}
const after = await get('/robot/state');
if (before.currentJob?.id !== after.currentJob?.id) throw new Error('Robot job changed during dry-run check');
const page = await fetch('http://localhost:3000/ai');
if (!page.ok) throw new Error(`AI page: ${page.status}`);
console.log('AI page OK; all requests were dry-run and no job was dispatched.');
