// Actual Qwen + catalog read from real robot backend; no robot driver or dispatch imported.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../../../.env', import.meta.url) });
process.env.AI_MODE = 'local';
const { classifyRobotTranscript } = await import('../src/services/robotIntent');
const base = 'http://localhost:4000/api';
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const headers = { cookie: login.headers.get('set-cookie')!.split(';')[0] };
const state = await (await fetch(base + '/robot/state', { headers })).json() as { simulated: boolean };
assert.equal(state.simulated, false);
const map = await (await fetch(base + '/robot/live-map', { headers })).json() as {
  pois: { id: string; metadata?: { display_name?: string; is_public?: boolean | string } }[] };
const catalog = map.pois.filter(p => p.metadata?.is_public !== false && p.metadata?.is_public !== 'false' && p.metadata?.display_name)
  .map(p => ({ code: p.id, nameTh: p.metadata!.display_name!, nameEn: p.metadata!.display_name! }));
assert.ok(catalog.length);
const results = [];
for (const text of ['พาไปที่นั่น', `ห้อง${catalog[0].nameTh}คือจุดหมายของผม ช่วยไปส่งหน่อย`]) {
  const started = Date.now();
  const result = await classifyRobotTranscript({ transcript: text, lang: 'th' }, undefined, catalog, 'model');
  const passed = text === 'พาไปที่นั่น' ? result.intent === 'unknown' && result.needsClarification === true && result.poiCode === null
    : result.intent === 'navigate_to' && result.poiCode === catalog[0].code && result.speechAct === 'request';
  results.push({ text, result, passed, elapsedMs: Date.now() - started });
  console.log(JSON.stringify(results.at(-1)));
}
const out = new URL('../../../reports/ai-fix-2026-10-21/', import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL('model-validation.json', out), JSON.stringify({ date: new Date().toISOString(), liveCatalog: true, motionDispatched: false, passed: results.filter(r => r.passed).length, total: results.length, results }, null, 2));
assert.ok(results.every(r => r.passed));
