// Non-destructive UI check. Never clicks the clear button or calls the clear endpoint.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../apps/backend/package.json',import.meta.url));require('dotenv').config({path:new URL('../.env',import.meta.url)});
const target=await(await fetch('http://localhost:9229/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let seq=0;const pending=new Map(),calls=[],errors=[];
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.method==='Network.requestWillBeSent')calls.push({url:d.params.request.url,method:d.params.request.method});if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200));}throw Error('Timeout '+expression);};
const out='reports/clear-map-2026-10-21';await fs.mkdir(out,{recursive:true});
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:3000/login'});await wait(`document.readyState==='complete'`);
 assert.equal(await evaluate(`fetch('http://localhost:4000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:${JSON.stringify(process.env.INITIAL_ADMIN_PASSWORD)}})}).then(r=>r.status)`),200);
 await send('Page.navigate',{url:'http://localhost:3000/control'});await wait(`!!document.querySelector('[aria-label="ยืนยันล้างแผนที่"]')`);
 await evaluate(`document.querySelector('[aria-label="ยืนยันล้างแผนที่"]').closest('details').open=true`);
 await new Promise(r=>setTimeout(r,1200));
 const canType=await evaluate(`!document.querySelector('[aria-label="ยืนยันล้างแผนที่"]').disabled`);
 const selector=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='ล้างแผนที่และเริ่มสร้างใหม่')`;
 assert.equal(await evaluate(`${selector}.disabled`),true);
 if(canType){
  for(const value of ['yes','CLEAR MAP','']){
   await evaluate(`(()=>{const e=document.querySelector('[aria-label="ยืนยันล้างแผนที่"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await wait(`${selector}.disabled===${value!=='CLEAR MAP'}`);
  }
 }
 const screenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/clear-map-control.png',Buffer.from(screenshot.data,'base64'));
 assert.ok(!calls.some(c=>c.url.endsWith('/robot/map/clear')),'Clear endpoint must never be requested by this UI check');assert.equal(errors.length,0);
 const report={at:new Date().toISOString(),passed:true,realBackend:true,clearEndpointCalled:false,hardwareMapCleared:false,confirmationTypingChecked:canType,disabledByRobotState:!canType,errors};
 await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{ws.close();await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{});}
