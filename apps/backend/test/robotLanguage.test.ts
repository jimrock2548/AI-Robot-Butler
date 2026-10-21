import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRobotLanguage, matchRobotDestinations } from '../src/services/robotLanguage';
import { classifyRobotTranscript } from '../src/services/robotIntent';
import { config } from '../src/config';

const catalog = [
  { code: 'a', nameTh: 'ห้องประชุม', nameEn: 'meeting room', aliases: ['ห้องเล็ก'] },
  { code: 'b', nameTh: 'ห้องประชุม A', nameEn: 'room 101', aliases: ['ห้องเล็ก'] },
];
test('Thai vowel normalization and English boundaries retain specific destinations and ambiguous aliases', () => {
  assert.equal(analyzeRobotLanguage('นำทางไปห้องประชุม A ให้หน่อย').speechAct, 'request');
  assert.equal(analyzeRobotLanguage('อ่านคำว่า “พาไปห้องประชุม”').speechAct, 'quoted');
  assert.deepEqual(matchRobotDestinations('Could you take me to the meeting room?', catalog).map(p => p.code), ['a']);
  assert.deepEqual(matchRobotDestinations('ไปห้องประชุม A หน่อย', catalog).map(p => p.code), ['b']);
  assert.equal(matchRobotDestinations('room 1010', catalog).length, 0);
  assert.equal(matchRobotDestinations('ห้องเล็ก', catalog).length, 2);
  assert.equal(matchRobotDestinations('พาไปห้องประชุม A แล้วไปห้องประชุมต่อ', catalog).length, 2);
});
test('polite requests, aliases, negations and ambiguity use rules without waiting for a model', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Model must not be called'); };
  try {
    for (const transcript of ['ช่วยพาไปที่ห้องประชุมหน่อย', 'ไปส่งที่ห้องประชุมได้ไหมครับ', 'Please bring me to the meeting room.']) {
      const decision = await classifyRobotTranscript({ transcript, lang: 'th' }, undefined, catalog);
      assert.equal(decision.poiCode, 'a'); assert.equal(decision.intent, 'navigate_to');
    }
    assert.equal((await classifyRobotTranscript({ transcript: 'อย่าไปห้องประชุม', lang: 'th' }, undefined, catalog)).intent, 'unknown');
    assert.equal((await classifyRobotTranscript({ transcript: 'พาไปห้องเล็ก', lang: 'th' }, undefined, catalog)).needsClarification, true);
  } finally { globalThis.fetch = original; }
});
test('semantic output is schema constrained and malformed or invented destinations fail closed', async () => {
  const original = globalThis.fetch;
  const previousMode = config.ai.mode;
  Object.assign(config.ai, { mode: 'local' });
  let output: unknown = { intent: 'navigate_to', confidence: 0.98, poiCode: 'a', speechAct: 'request', needsClarification: false };
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.response_format.json_schema.schema.properties.poiCode.enum, [null, 'a', 'b']);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  };
  try {
    const classify = () => classifyRobotTranscript({ transcript: 'ห้องประชุมคือจุดหมาย ช่วยไปส่งผมที', lang: 'th' }, undefined, catalog);
    assert.equal((await classify()).decisionSource, 'model');
    output = { intent: 'navigate_to', confidence: 1, poiCode: 'invented', speechAct: 'request', needsClarification: false };
    await assert.rejects(classify, /ตรวจสอบไม่ได้/);
    output = { intent: 'navigate_to', destination: 'a' };
    await assert.rejects(classify, /ตรวจสอบไม่ได้/);
  } finally { globalThis.fetch = original; Object.assign(config.ai, { mode: previousMode }); }
});
