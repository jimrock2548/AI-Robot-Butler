import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatEvent } from '../src/services/chatService';
process.env.ROBOT_MODE = 'hermes';
process.env.HERMES_READ_ONLY = 'true';
const { config } = await import('../src/config');
const { streamKioskChat } = await import('../src/services/chatService');
const { initWorld, getWorld } = await import('../src/db/memory');
const { handleRobotAiCommand } = await import('../src/services/robotAiService');
const { hermes } = await import('../src/hermes/driver');
Object.assign(config.ai, { navigationOnly: false, mode: 'local' });

test('general chat and web answers do not read an offline hardware map or dispatch motion', async () => {
  await initWorld({ demoMap: false });
  const original = globalThis.fetch, robotRequests: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.startsWith(config.ai.searxngUrl)) return Response.json({ results: [{ title: 'Verified source', url: 'https://example.com/source', content: 'A test fact.' }] });
    if (url.includes('/v1/chat/completions')) return new Response('data: {"choices":[{"delta":{"content":"คำตอบทดสอบ"}}]}\n\ndata: [DONE]\n\n');
    robotRequests.push(url); throw new Error('Robot unavailable');
  };
  try {
    for (const [text, route] of [['สวัสดี', 'chat'], ['ข่าวล่าสุด NASA', 'web']]) {
      const events: ChatEvent[] = [];
      await streamKioskChat({ lang: 'th', messages: [{ role: 'user', content: text }] }, event => events.push(event), new AbortController().signal);
      assert.deepEqual(events[0], { type: 'route', route });
      assert.ok(events.some(e => e.type === 'delta' && e.text === 'คำตอบทดสอบ'));
      const done = events.at(-1); assert.equal(done?.type, 'done');
      if (done?.type === 'done') { assert.ok(!done.job); if (route === 'web') assert.equal(done.sources?.length, 1); }
    }
    assert.deepEqual(robotRequests, []); assert.equal(getWorld().jobs.length, 0);
  } finally { globalThis.fetch = original; }
});

test('navigation preview reports an unavailable robot map as 503 and creates no job', async () => {
  const original = globalThis.fetch;
  const originalInspect = hermes!.inspectMap;
  // The SDK captures fetch at construction; replace its map reader to avoid touching a connected robot.
  hermes!.inspectMap = async () => { throw new Error('Robot unavailable'); };
  globalThis.fetch = async () => { throw new Error('Robot unavailable'); };
  try {
    await assert.rejects(handleRobotAiCommand({ transcript: 'พาไปหน้าประตูห้อง', lang: 'th', dryRun: true }, { id: 1, name: 'test' }),
      (error: any) => error.status === 503 && error.code === 'robot_map_unavailable');
    assert.equal(getWorld().jobs.length, 0);
  } finally { globalThis.fetch = original; hermes!.inspectMap = originalInspect; }
});
