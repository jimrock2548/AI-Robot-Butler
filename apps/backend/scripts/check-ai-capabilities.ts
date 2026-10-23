// Real local model + real search; navigation uses a named fixture and dryRun only.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import type { ChatEvent } from '../src/services/chatService';
loadEnv({ path: new URL('../../../.env', import.meta.url) });
process.env.ROBOT_MODE = 'hermes'; process.env.HERMES_READ_ONLY = 'true'; process.env.DB_MODE = 'memory'; process.env.AI_MODE = 'local';
const { config } = await import('../src/config');
const { initWorld, getWorld } = await import('../src/db/memory');
const { streamKioskChat } = await import('../src/services/chatService');
const { handleRobotAiCommand } = await import('../src/services/robotAiService');
const { classifyRobotTranscript } = await import('../src/services/robotIntent');
await initWorld({ demoMap: false });
const results: Record<string, unknown>[] = [];
const chat = async (mode: boolean, text: string, route: string) => {
  Object.assign(config.ai, { navigationOnly: mode });
  const events: ChatEvent[] = [], start = Date.now(); let error: string | undefined;
  try { await streamKioskChat({ lang: 'th', messages: [{ role: 'user', content: text }] }, event => events.push(event), AbortSignal.timeout(100000)); }
  catch (e) { error = String(e); }
  const answer = events.filter(e => e.type === 'delta').map(e => e.text).join('');
  const done = [...events].reverse().find(e => e.type === 'done');
  const sources = done?.type === 'done' ? done.sources ?? [] : [];
  assert.ok(!done || done.type !== 'done' || !done.job, 'Chat must not dispatch jobs');
  const actualRoute = events.find(e => e.type === 'route');
  const item = { mode: mode ? 'navigation-only' : 'general-chat-enabled', text, route: actualRoute?.type === 'route' ? actualRoute.route : null,
    answer, sources, error, passed: !error && !!answer && actualRoute?.type === 'route' && actualRoute.route === route && (route !== 'web' || sources.length > 0), elapsedMs: Date.now() - start };
  results.push(item); console.log(JSON.stringify(item));
};
await chat(true, 'สวัสดี', 'database');
await chat(true, 'ช่วยเขียนคำอวยพรวันเกิดสั้น ๆ ให้เพื่อนหน่อย', 'database');
await chat(true, 'ข่าวล่าสุด NASA', 'database');
await chat(false, 'ช่วยเขียนคำอวยพรวันเกิดสั้น ๆ ให้เพื่อนหน่อย', 'chat');
await chat(false, 'ข่าวล่าสุด NASA', 'web');
const poiId = '610d0000-0000-4000-8000-000000000001';
const map = { x: -5, y: -5, width: 200, height: 200, resolution: .05, cellsBase64: '', localizationQuality: 90,
  mappingEnabled: false, home: { x: 0, y: 0, yaw: 0 }, poiCount: 1, modelName: null, softwareVersion: null, dockingStatus: null,
  capturedAt: new Date().toISOString(), pois: [{ id: poiId, pose: { x: 1.77, y: -.02, yaw: 1.57 }, metadata: { display_name: 'หน้าประตูห้อง' } }] };
for (const [text, intent, rejected] of [
  ['ช่วยพาไปหน้าประตูห้องหน่อย', 'navigate_to', false], ['ไปส่งที่หน้าประตูห้องได้ไหมครับ', 'navigate_to', false],
  ['กลับจุดชาร์จ', 'return_to_dock', false], ['หยุด', 'cancel_job', false], ['พาไปที่นั่น', 'unknown', true],
] as const) {
  const start = Date.now();
  const data = await handleRobotAiCommand({ transcript: text, lang: 'th', dryRun: true }, { id: 1, name: 'diagnostic' }, AbortSignal.timeout(30000),
    { loadMap: async () => map, classify: classifyRobotTranscript });
  assert.ok(!data.job); assert.equal(data.dryRun, true);
  const item = { mode: 'command-preview-fixture-catalog', text, result: data, passed: data.intent === intent && data.rejected === rejected, elapsedMs: Date.now() - start };
  results.push(item); console.log(JSON.stringify(item));
}
assert.equal(getWorld().jobs.length, 0);
const report = { at: new Date().toISOString(), model: config.ai.model, realModel: true, realSearch: true, robotMap: 'fixture, not live hardware', motionDispatched: false, passed: results.filter(r=>r.passed).length, total: results.length, results };
const out = new URL('../../../reports/ai-capabilities-2026-10-23/', import.meta.url); await mkdir(out, { recursive: true });
await writeFile(new URL('engine-results.json', out), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, total: report.total }));
