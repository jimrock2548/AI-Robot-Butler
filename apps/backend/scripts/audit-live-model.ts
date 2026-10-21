// Calls only localhost LLM classifier. Does not import robot drivers or dispatch jobs.
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
process.env.ROBOT_MODE = 'mock';
process.env.DB_MODE = 'memory';
process.env.AI_MODE = 'local';
const { classifyRobotTranscript } = await import('../src/services/robotIntent');
const catalog = [
  { code: '11111111-1111-4111-8111-111111111111', nameTh: 'ห้องประชุม', nameEn: 'Meeting room' },
  { code: '22222222-2222-4222-8222-222222222222', nameTh: 'ห้องครัว', nameEn: 'Kitchen' },
];
const cases = [
  { text: 'พาไปห้องประชุม', intents: ['navigate_to'], poi: catalog[0].code },
  { text: 'ช่วยไปส่งฉันที่ห้องครัวหน่อยได้ไหม', intents: ['navigate_to'], poi: catalog[1].code },
  { text: 'ห้องประชุมอยู่ไหน', intents: ['where_is'], poi: catalog[0].code },
  { text: 'อย่าพาไปห้องประชุม', intents: ['unknown'], poi: null },
  { text: 'พาไปที่นั่น', intents: ['unknown'], poi: null },
  { text: 'เรียกแท็กซี่ให้หน่อย', intents: ['unknown', 'answer_question'], poi: null },
];
const results = [];
for (const item of cases) {
  const started = Date.now();
  try {
    const result = await classifyRobotTranscript({ transcript: item.text, lang: 'th' }, undefined, catalog, 'model');
    results.push({ text: item.text, result, elapsedMs: Date.now() - started,
      passed: item.intents.includes(result.intent) && result.poiCode === item.poi
        && (result.intent !== 'navigate_to' || result.speechAct === 'request') });
  } catch (error) { results.push({ text: item.text, error: String(error), elapsedMs: Date.now() - started, passed: false }); }
  console.log(JSON.stringify(results.at(-1)));
}
const output = new URL('../../../reports/ai-audit-2026-10-19/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('live-model-results.json', output), JSON.stringify({ date: new Date().toISOString(), mode: 'model-primary classification with mandatory safety rules retained', model: 'qwen3.5-2b',
  realHardwareAccess: false, motionDispatched: false, passed: results.filter(r => r.passed).length, total: results.length, results }, null, 2));
await appendFile(new URL('REPORT.md', output), `\n\n## โมเดลจริงแยกจากเว็บ\n\nทดสอบ Qwen ในโหมด model-primary โดยไม่เรียก driver หุ่นและยังคงกฎปฏิเสธบังคับ: ผ่าน ${results.filter(r => r.passed).length}/${results.length} กรณีในชุดเล็กนี้ ดู decisionSource รายกรณีใน live-model-results.json ไม่ใช่การยืนยันความแม่นยำทั่วไป\n`);
