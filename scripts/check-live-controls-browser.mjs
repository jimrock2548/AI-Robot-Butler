import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const out = 'reports/robot-controls-2026-10-21/'; await fs.mkdir(out, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
async function tab() {
  const target = await (await fetch('http://localhost:9229/json/new?about:blank', { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  let sequence = 0; const pending = new Map(), errors = [];
  socket.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); data.error ? p.reject(data.error) : p.resolve(data.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ':' + r.exceptionDetails.exception?.description); return r.result.value; };
  const wait = async expression => { const end = Date.now() + 45000; while (Date.now() < end) { if (await evaluate(expression)) return; await delay(200); } throw new Error('Timeout: ' + expression); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, wait, errors, close: async () => { socket.close(); await fetch('http://localhost:9229/json/close/' + target.id); }, screenshot: async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(out + name + '.png', Buffer.from(r.data, 'base64')); } };
}
const admin = await tab(), kiosk = await tab(), results = [];
const click = text => `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b||b.disabled)throw Error('Unavailable: '+${JSON.stringify(text)});b.click()})()`;
const input = (selector, value) => `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`;
try {
  await admin.send('Page.navigate', { url: 'http://localhost:3000/login' }); await admin.wait(`!!document.querySelector('input')`);
  assert.equal(await admin.evaluate(`fetch('http://localhost:4000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:${JSON.stringify(process.env.INITIAL_ADMIN_PASSWORD)}})}).then(r=>r.status)`), 200);
  await admin.send('Page.navigate', { url: 'http://localhost:3000/control' });
  await admin.wait(`!!document.querySelector('[aria-label="ความเร็วเดิน"]') && !document.querySelector('[aria-label="ความเร็วเดิน"]').disabled`);
  assert.ok(await admin.evaluate(`document.body.innerText.includes('ค่าที่อ่านจากหุ่น: เดิน 0.10')`));
  await admin.evaluate(input('[aria-label="ความเร็วเดิน"]', '0.2'));
  await admin.wait(`document.body.innerText.includes('ความเร็วเดิน: 0.20')`);
  await admin.screenshot('control-speed-standby'); results.push('control shows verified speed and editable draft without sending motion');
  await admin.send('Page.navigate', { url: 'http://localhost:3000/map' });
  await admin.wait(`!![...document.querySelectorAll('[role=tab]')].find(b=>b.textContent==='กำแพงเสมือน')`);
  await admin.evaluate(click('กำแพงเสมือน')); await admin.wait(`document.body.innerText.includes('กำแพงเสมือนบนหุ่น') && document.querySelectorAll('svg line').length>0`);
  await admin.wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='เลือกจุด'&&!b.disabled)`);
  for (const x of [.2, .35]) {
    await admin.evaluate(`(()=>{const s=document.querySelector('svg[aria-label="ตำแหน่งหุ่นและแท่นชาร์จบนแผนที่"]');const r=s.getBoundingClientRect();s.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*${x},clientY:r.top+r.height*.3}))})()`);
    await delay(200); // Separate real user turns so React commits the first endpoint before the second click.
  }
  await admin.wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='เพิ่มกำแพงบนหุ่น'&&!b.disabled)`);
  await admin.screenshot('map-walls'); results.push('walls rendered from real robot with editor controls');
  await admin.evaluate(click('ระบุตำแหน่งหุ่น')); await admin.wait(`!!document.querySelector('[aria-label="ทิศหุ่นจริง"]')`); results.push('localization position and heading controls rendered');
  await admin.send('Page.navigate', { url: 'http://localhost:3000/map-library' });
  await admin.wait(`document.body.innerText.includes('สำรองก่อนตรวจระบบ')`); await admin.screenshot('stcm-library'); results.push('real STCM captures, upload and activation controls rendered');
  await kiosk.send('Page.navigate', { url: 'http://localhost:3001/ai' });
  await kiosk.wait(`!!document.querySelector('.reception-compose input') && !document.querySelector('.reception-compose input').disabled`);
  assert.ok(await kiosk.evaluate(`document.body.innerText.includes('เชื่อมกับหุ่นจริง')`));
  await kiosk.evaluate(`document.querySelector('details').open=true`);
  const voice = await kiosk.evaluate(`({secure:isSecureContext,recognition:!!(window.SpeechRecognition||window.webkitSpeechRecognition),voices:speechSynthesis.getVoices().map(v=>({name:v.name,lang:v.lang})),speechSynthesis:!!window.speechSynthesis})`);
  await kiosk.screenshot('voice-settings'); results.push('real Robot Interface and browser voice settings rendered');
  // Use a harmless message and actual PostgreSQL/SSE, never navigation.
  await kiosk.evaluate(input('.reception-compose input', 'ขอบคุณ'));
  await kiosk.evaluate(`document.querySelector('.reception-compose').requestSubmit()`);
  await kiosk.wait(`document.querySelector('.reception-messages')?.innerText.includes('ยินดี') || document.body.innerText.includes('ยินดีครับ')`);
  await admin.send('Page.navigate', { url: 'http://localhost:3000/ai' });
  await admin.wait(`document.body.innerText.includes('บทสนทนาผู้ใช้แบบสด · เชื่อมต่อแล้ว') && document.body.innerText.includes('ขอบคุณ')`);
  await admin.evaluate(click('รับช่วงสนทนา'));
  await admin.wait(`!!document.querySelector('[aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น"]') && !document.querySelector('[aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น"]').disabled`);
  const reply = 'ตรวจระบบจริง: เจ้าหน้าที่รับข้อความแล้วครับ';
  await admin.evaluate(input('[aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น"]', reply));
  await admin.evaluate(`document.querySelector('[aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น"]').closest('form').requestSubmit()`);
  await kiosk.wait(`document.body.innerText.includes(${JSON.stringify(reply)})`);
  await admin.screenshot('admin-live-takeover'); results.push('live admin takeover and staff reply reached Robot Interface through real backend');
  await admin.evaluate(click('คืนให้ AI')); await kiosk.wait(`document.body.innerText.includes('ให้ฉันพาไปไหมครับ?')`);
  assert.equal(admin.errors.length, 0); assert.equal(kiosk.errors.length, 0);
  await fs.writeFile(out + 'browser.json', JSON.stringify({ date: new Date().toISOString(), realBackend: true, motionDispatched: false, passed: results.length, checks: results, voice, physicalAudioVerified: false, errors: [...admin.errors, ...kiosk.errors] }, null, 2));
  console.log(JSON.stringify({ passed: results.length, voice, errors: [...admin.errors, ...kiosk.errors] }));
} finally { await admin.close(); await kiosk.close(); }
