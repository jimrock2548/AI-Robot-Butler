// Actual Admin / PostgreSQL / Robot Interface. Only safe non-action chat questions; restore initial setting.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const out='reports/ai-scope-2026-10-23';await fs.mkdir(out,{recursive:true});
const base='http://localhost:4000/api',proxy='http://localhost:3001/api/kiosk';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.INITIAL_ADMIN_PASSWORD})});assert.equal(login.status,200);
const headers={'Content-Type':'application/json',cookie:login.headers.get('set-cookie').split(';')[0]};
const initial=await(await fetch(base+'/ai/settings',{headers})).json();
const before=await(await fetch(base+'/robot/state',{headers})).json();
const checks=[], errors=[];
async function tab(){
 const target=await(await fetch('http://localhost:9229/json/new?about:blank',{method:'PUT'})).json();const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timeout '+expression);};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 return {send,evaluate,wait,close:async()=>{ws.close();await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{});},screenshot:async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/'+name+'.png',Buffer.from(r.data,'base64'));}};
}
const admin=await tab(),kiosk=await tab();
const selector='input[aria-label="จำกัด AI เฉพาะบริการนำทาง"]';
const freshRead=()=>JSON.parse(execFileSync(process.execPath,['--import','tsx','scripts/read-ai-settings.ts'],{cwd:new URL('../apps/backend/',import.meta.url),encoding:'utf8',windowsHide:true}));
const chat=async content=>{
 assert.ok(!/พาไป|หยุด|กลับ.*ชาร์จ/.test(content));
 const c=await(await fetch(proxy+'/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
 const r=await fetch(proxy+'/conversation/'+c.session.id+'/messages',{method:'POST',headers:{'Content-Type':'application/json','x-conversation-token':c.token},body:JSON.stringify({content,lang:'th'}),signal:AbortSignal.timeout(90000)});
 const events=(await r.text()).trim().split('\n').map(line=>JSON.parse(line));assert.ok(events.every(e=>e.type!=='done'||!e.job));assert.ok(!events.some(e=>e.type==='error'));
 return {text:content,route:events.find(e=>e.type==='route')?.route,answer:events.filter(e=>e.type==='delta').map(e=>e.text).join(''),sources:events.find(e=>e.type==='done')?.sources??[]};
};
try{
 await admin.send('Page.navigate',{url:'http://localhost:3000/login'});await admin.wait(`document.readyState==='complete'`);
 assert.equal(await admin.evaluate(`fetch('http://localhost:4000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:${JSON.stringify(process.env.INITIAL_ADMIN_PASSWORD)}})}).then(r=>r.status)`),200);
 await admin.send('Page.navigate',{url:'http://localhost:3000/ai'});await admin.wait(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);
 await kiosk.send('Page.navigate',{url:'http://localhost:3001/ai'});await kiosk.wait(`!!document.querySelector('.robot-ai-scope')`);
 const toggle=async value=>{
  if(await admin.evaluate(`document.querySelector(${JSON.stringify(selector)}).checked`)!==value)await admin.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await admin.wait(`!document.querySelector(${JSON.stringify(selector)}).disabled&&document.querySelector(${JSON.stringify(selector)}).checked===${value}`);
  await kiosk.wait(`document.querySelector('.robot-ai-scope').textContent.includes(${JSON.stringify(value?'เฉพาะนำทาง':'สนทนาและค้นเว็บ')})`);
  assert.equal((await(await fetch(base+'/ai/settings',{headers})).json()).navigationOnly,value);
  assert.equal(freshRead().navigationOnly,value);
 };
 await toggle(false);await admin.screenshot('admin-general-chat');await kiosk.screenshot('interface-general-chat');
 checks.push({name:'Admin switch and live kiosk mode update; fresh process reads persisted unrestricted setting',passed:true});
 const general=await chat('ช่วยเขียนคำอวยพรวันเกิดสั้น ๆ ให้เพื่อนหน่อย');assert.equal(general.route,'chat');assert.ok(general.answer);checks.push({name:'General question uses the real local model',passed:true,...general});
 const web=await chat('ข่าวล่าสุด NASA');assert.equal(web.route,'web');assert.ok(web.sources.length>0);checks.push({name:'Web question uses live search and returns sources',passed:true,...web});
 await toggle(true);await admin.screenshot('admin-navigation-only');
 const restricted=await chat('ช่วยเขียนคำอวยพรวันเกิดสั้น ๆ ให้เพื่อนหน่อย');assert.equal(restricted.route,'database');assert.match(restricted.answer,/จุดหมาย/);checks.push({name:'Switching restriction on immediately limits general questions',passed:true,...restricted});
 await admin.send('Page.reload');await admin.wait(`document.querySelector(${JSON.stringify(selector)})?.checked===true&&!document.querySelector(${JSON.stringify(selector)}).disabled`);checks.push({name:'Admin page reload retains the saved choice',passed:true});
 assert.equal(errors.length,0);
}finally{
 const restore=await fetch(base+'/ai/settings',{method:'PUT',headers,body:JSON.stringify(initial)});assert.equal(restore.status,200);
 await admin.close();await kiosk.close();
}
const after=await(await fetch(base+'/robot/state',{headers})).json();assert.equal(after.currentJob?.id??null,before.currentJob?.id??null);
const report={at:new Date().toISOString(),passed:true,initial,final:await(await fetch(base+'/ai/settings',{headers})).json(),realBackend:true,postgresVerifiedInFreshProcesses:true,motionDispatched:false,jobBefore:before.currentJob?.id??null,jobAfter:after.currentJob?.id??null,checks,errors};
await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
