// Actual services and UI. Navigation is inspected through dryRun only; never dispatch motion.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const proxy = 'http://localhost:3001/api/kiosk', base = 'http://localhost:4000/api';
const status = await (await fetch(proxy + '/ai-status')).json();
const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const headers = { 'Content-Type': 'application/json', cookie: login.headers.get('set-cookie').split(';')[0] };
const state = await (await fetch(base + '/robot/state', { headers })).json();
const c = await (await fetch(proxy + '/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
const results = [];
for (const content of ['สวัสดี', 'ช่วยเขียนคำอวยพรวันเกิดสั้น ๆ ให้เพื่อนหน่อย', 'ข่าวล่าสุด NASA']) {
  const r = await fetch(`${proxy}/conversation/${c.session.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-conversation-token': c.token }, body: JSON.stringify({ content, lang: 'th' }), signal: AbortSignal.timeout(90000) });
  const events = (await r.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(events.every(e=>e.type!=='done'||!e.job));
  results.push({ content, httpStatus: r.status, route: events.find(e=>e.type==='route')?.route, answer: events.filter(e=>e.type==='delta').map(e=>e.text).join(''), errors: events.filter(e=>e.type==='error') });
}
const commands = [];
for (const transcript of ['หยุด', 'ช่วยพาไปหน้าประตูห้องหน่อย']) {
 const r = await fetch(base + '/ai/command', { method: 'POST', headers, body: JSON.stringify({ transcript, lang: 'th', dryRun: true }), signal: AbortSignal.timeout(30000) });
 const body = await r.json(); assert.ok(!body.job); commands.push({ transcript, status: r.status, result: body });
}
const target = await (await fetch('http://localhost:9229/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let seq=0; const pending=new Map(), errors=[];
ws.onmessage=event=>{const d=JSON.parse(event.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timeout '+expression);};
const out='reports/ai-capabilities-2026-10-23';await fs.mkdir(out,{recursive:true});
let browser;
try {
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:3001/ai'});
 await wait(`!!document.querySelector('.robot-open-chat')`);
 await evaluate(`document.querySelector('.robot-open-chat').click()`);
 await wait(`!!document.querySelector('.reception-compose input')&&!document.querySelector('.reception-compose input').disabled`);
 await evaluate(`(()=>{const e=document.querySelector('.reception-compose input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'สวัสดี');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await wait(`!document.querySelector('.reception-compose button').disabled`);
 await evaluate(`document.querySelector('.reception-compose').requestSubmit()`);
 await wait(`document.querySelector('.reception-turn.assistant p')?.textContent.includes('สวัสดี')`);
 const answer=await evaluate(`document.querySelector('.reception-turn.assistant p').textContent`);
 const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/live-interface.png',Buffer.from(shot.data,'base64'));
 assert.equal(errors.length,0);browser={passed:true,answer,apiStubs:false,errors};
} finally {ws.close();await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{});}
const after=await(await fetch(base+'/robot/state',{headers})).json();
assert.equal(after.currentJob?.id??null,state.currentJob?.id??null);
const report={at:new Date().toISOString(),status,robot:{linkStatus:after.linkStatus,simulated:after.simulated,jobBefore:state.currentJob?.id??null,jobAfter:after.currentJob?.id??null},motionDispatched:false,results,commands,browser};
await fs.writeFile(out+'/live-interface.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
