// Read-only browser verification of the map restored on the real robot.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const target = await (await fetch('http://localhost:9229/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0; const pending = new Map(), calls = [], errors = [];
ws.onmessage = event => {
  const d = JSON.parse(event.data);
  if (d.method === 'Network.requestWillBeSent') calls.push({ url: d.params.request.url, method: d.params.request.method });
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value; };
const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 200)); } throw Error('Timeout: ' + expression); };
const out = 'reports/map-restore-2026-10-21'; await fs.mkdir(out, { recursive: true });
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:3000/login' }); await wait(`document.readyState==='complete'`);
  assert.equal(await evaluate(`fetch('http://localhost:4000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:${JSON.stringify(process.env.INITIAL_ADMIN_PASSWORD)}})}).then(r=>r.status)`), 200);
  await send('Page.navigate', { url: 'http://localhost:3000/map' });
  await wait(`document.querySelector('canvas[aria-label="แผนที่ SLAM ที่อ่านจากหุ่น"]')?.width===434 && document.body.innerText.includes('POI 5 จุด') && document.body.innerText.includes('สด ·')`);
  const canvas = await evaluate(`(()=>{const c=document.querySelector('canvas[aria-label="แผนที่ SLAM ที่อ่านจากหุ่น"]');return {width:c.width,height:c.height,colors:new Set([...c.getContext('2d').getImageData(0,0,c.width,c.height).data]).size}})()`);
  assert.equal(canvas.height, 360); assert.ok(canvas.colors > 2, 'Grid must contain actual rendered pixels');
  await evaluate(`document.querySelector('canvas[aria-label="แผนที่ SLAM ที่อ่านจากหุ่น"]').scrollIntoView({block:'center'})`);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(out + '/restored-map.png', Buffer.from(screenshot.data, 'base64'));
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(b=>b.textContent==='กำแพงเสมือน').click()`);
  await wait(`[...document.querySelectorAll('button')].filter(b=>/^กำแพง #/.test(b.textContent)).length===18`);
  assert.equal(calls.filter(c => c.url.includes('/api/robot/') && !['GET', 'HEAD', 'OPTIONS'].includes(c.method)).length, 0);
  const report = { at: new Date().toISOString(), passed: true, realBackend: true, canvas, poiCount: 5, wallCount: 18, robotWrites: 0, errors };
  report.passed = errors.length === 0;
  await fs.writeFile(out + '/browser.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0);
} finally { ws.close(); await fetch('http://localhost:9229/json/close/' + target.id).catch(() => {}); }
