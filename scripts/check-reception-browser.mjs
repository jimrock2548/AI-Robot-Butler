// UI integration against isolated Mock only. Speech APIs are stubs, not an acoustic accuracy test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../reports/offline-reception/', import.meta.url));
await fs.mkdir(out, { recursive: true });
const health = await (await fetch('http://localhost:4010/api/health')).json();
assert.equal(health.dbMode, 'memory');
const status = await (await fetch('http://localhost:3011/api/kiosk/ai-status')).json();
assert.equal(status.mockConnected, true, 'Refuse to run browser interactions against hardware');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function tab() {
  const target = await (await fetch('http://localhost:9229/json/new?about:blank', { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let seq = 0; const pending = new Map(); const errors = [];
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.id && pending.has(data.id)) { const { resolve, reject } = pending.get(data.id); pending.delete(data.id); data.error ? reject(data.error) : resolve(data.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const wait = async expression => { const until = Date.now() + 30000; while (Date.now() < until) { if (await evaluate(expression)) return; await delay(150); } throw new Error('Timeout: ' + expression); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, wait, errors, close: async () => { socket.close(); await fetch(`http://localhost:9229/json/close/${target.id}`).catch(() => {}); }, screenshot: async name => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(out + name + '.png', Buffer.from(r.data, 'base64')); } };
}
const kiosk = await tab(), admin = await tab();
const checks = [];
const setInput = (selector, value) => `(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`;
const clickText = text => `(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b || b.disabled) throw Error('Button unavailable'); b.click(); })()`;
try {
  await kiosk.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__spoken=[]; window.__recognitionAborts=0;
    class FakeRecognition { start(){window.__recognition=this;} abort(){window.__recognitionAborts++;this.onend?.();} }
    window.SpeechRecognition=FakeRecognition;
    window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
    Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{lang:'th-TH',name:'Test Thai'}],cancel:()=>{},speak:u=>{window.__spoken.push(u.text);setTimeout(()=>u.onend?.(),20);}}});
    window.__say=t=>window.__recognition.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:t}}]});
  ` });
  await kiosk.send('Page.navigate', { url: 'http://localhost:3011/ai' });
  await kiosk.wait(`!!document.querySelector('.reception-compose input') && !document.querySelector('.reception-compose input').disabled`);
  await kiosk.evaluate(clickText('ฟังคำเรียก'));
  await kiosk.evaluate(`window.__say('พาไปห้องประชุม')`);
  assert.equal(await kiosk.evaluate(`document.querySelector('.reception-compose input').value`), '');
  await kiosk.evaluate(`window.__say('สวัสดีเฮอร์มีส พาไปห้องประชุม')`);
  await kiosk.wait(`document.querySelector('.reception-compose input').value==='พาไปห้องประชุม'`);
  checks.push('wake gates transcript; valid wake fills preview without sending');
  await kiosk.evaluate(setInput('.reception-compose input', 'เรียกแท็กซี่ให้หน่อย'));
  await kiosk.evaluate(`document.querySelector('.reception-compose').requestSubmit()`);
  await kiosk.wait(`document.querySelector('.reception-turns').textContent.includes('ยังเรียกแท็กซี่')`);
  checks.push('unsupported request receives bounded reply');
  await kiosk.screenshot('robot-interface-desktop');
  await admin.send('Page.navigate', { url: 'http://localhost:3010/login' });
  await admin.wait(`!!document.querySelector('input[autocomplete="username"]')`);
  await admin.evaluate(`fetch('http://localhost:4010/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})}).then(r=>{if(!r.ok)throw Error('Login '+r.status)})`);
  await admin.send('Page.navigate', { url: 'http://localhost:3010/ai' });
  await admin.wait(`document.body.textContent.includes('ยังเรียกแท็กซี่')`);
  await admin.evaluate(clickText('รับช่วงสนทนา'));
  await kiosk.wait(`document.body.textContent.includes('เจ้าหน้าที่กำลังดูแลคุณ')`);
  await kiosk.evaluate(`document.querySelector('.reception-voice input[type=checkbox]').click()`);
  await admin.evaluate(setInput('input[aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น"]', 'เจ้าหน้าที่พร้อมช่วยเหลือครับ'));
  await admin.evaluate(`document.querySelector('input[aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น"]').form.requestSubmit()`);
  await kiosk.wait(`document.querySelector('.reception-turns').textContent.includes('เจ้าหน้าที่พร้อมช่วยเหลือครับ')`);
  await kiosk.wait(`window.__spoken.includes('เจ้าหน้าที่พร้อมช่วยเหลือครับ')`);
  checks.push('admin SSE shows chat; staff takeover and reply reach kiosk; TTS stub invoked');
  await admin.screenshot('admin-live-chat');
  await kiosk.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await kiosk.evaluate(`document.querySelector('.reception-shell').scrollWidth <= document.querySelector('.reception-shell').clientWidth+1`), true);
  await kiosk.screenshot('robot-interface-mobile');
  checks.push('mobile screen has no horizontal overflow');
  await admin.send('Page.navigate', { url: 'http://localhost:3010/map-library' });
  await admin.wait(`!!document.querySelector('textarea')`);
  await admin.evaluate(clickText('บันทึกลงคลัง'));
  await admin.wait(`document.body.textContent.includes('บันทึกแผนที่และจุดประจำในคลังแล้ว')`);
  await admin.evaluate(clickText('เลือกแสดง'));
  await admin.wait(`!!document.querySelector('svg[aria-label^="แผนผังทดลอง"]')`);
  await admin.evaluate(clickText('จำลองตำแหน่งที่จุดประจำ'));
  await admin.evaluate(clickText('＋ แผนที่ใหม่'));
  const secondMap = { name: 'อาคาร B ชั้น 2', widthM: 16, heightM: 10, pois: [{ code: 'WAIT', name: 'จุดประจำชั้นสอง', x: 3, y: 2, headingDeg: 0 }, { code: 'ROOM2', name: 'ห้องสัมมนา', x: 11, y: 6, headingDeg: 90 }], standbyCode: 'WAIT', returnPolicy: 'after_job' };
  await admin.evaluate(`(() => {const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(JSON.stringify(secondMap, null, 2))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await admin.evaluate(clickText('บันทึกลงคลัง'));
  await admin.wait(`document.body.textContent.includes('อาคาร B ชั้น 2') && [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='บันทึกลงคลัง')?.disabled === false`);
  await admin.evaluate(`(() => {const s=[...document.querySelectorAll('strong')].find(e=>e.textContent.startsWith('อาคาร B ชั้น 2'));[...s.parentElement.querySelectorAll('button')].find(b=>b.textContent==='เลือกแสดง').click();})()`);
  await admin.wait(`!!document.querySelector('svg[aria-label="แผนผังทดลอง อาคาร B ชั้น 2"]')`);
  await admin.evaluate(clickText('จำลองตำแหน่งที่จุดประจำ'));
  await admin.screenshot('map-library-standby');
  checks.push('two independent map libraries save, select and preview their standby points');
  assert.equal(kiosk.errors.length, 0, 'Kiosk runtime errors: ' + kiosk.errors.join(','));
  assert.equal(admin.errors.length, 0, 'Admin runtime errors: ' + admin.errors.join(','));
  const result = { date: new Date().toISOString(), robotMode: 'mock', realHardwareAccess: false, speech: 'stubbed browser API, not real microphone/voice accuracy', checks, runtimeErrors: [] };
  await fs.writeFile(out + 'browser-validation.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await kiosk.close(); await admin.close(); }
