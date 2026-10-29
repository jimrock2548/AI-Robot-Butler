// Deletes only a newly created, uniquely named test archive. Never activates or clears a robot map.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/backend/package.json',import.meta.url));require('dotenv').config({path:new URL('../.env',import.meta.url)});
const base='http://localhost:4000/api', out='reports/map-archive-delete-2026-10-29';await fs.mkdir(out,{recursive:true});
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.INITIAL_ADMIN_PASSWORD})});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
const name='__DELETE_UI_TEST__ '+Date.now();
const uploaded=await fetch(base+'/robot/map-archives/upload?name='+encodeURIComponent(name),{method:'POST',headers:{cookie,'Content-Type':'application/octet-stream'},body:Buffer.from('STCM-disposable-delete-ui-fixture-only')});assert.equal(uploaded.status,201);const item=await uploaded.json();
const target=await(await fetch('http://localhost:9229/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let seq=0,acceptDialog=false;const pending=new Map(),calls=[],errors=[];
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:acceptDialog});if(d.method==='Network.requestWillBeSent')calls.push({url:d.params.request.url,method:d.params.request.method});if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.text);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{for(let i=0;i<250;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,150));}throw Error('Timeout '+expression);};
const selector=`button[aria-label=${JSON.stringify('ลบแผนที่ '+name)}]`;
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://localhost:3000/login'});await wait(`document.readyState==='complete'`);
 assert.equal(await evaluate(`fetch('http://localhost:4000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:${JSON.stringify(process.env.INITIAL_ADMIN_PASSWORD)}})}).then(r=>r.status)`),200);
 await send('Page.navigate',{url:'http://localhost:3000/map-library'});await wait(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);
 assert.equal(await db.service_documents.count({where:{id:{in:[item.id,item.id+':blob']}}}),2);
 await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 assert.equal(calls.filter(c=>c.method==='DELETE').length,0,'Cancel must not send a deletion');
 assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`));
 acceptDialog=true;await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await wait(`!document.querySelector(${JSON.stringify(selector)})&&document.body.innerText.includes('ลบไฟล์แผนที่ออกจากคลังแล้ว')`);
 assert.equal(calls.filter(c=>c.method==='DELETE'&&c.url===base+'/robot/map-archives/'+item.id).length,1);
 assert.equal(calls.filter(c=>c.url.includes('/api/robot/')&&!['GET','HEAD','OPTIONS'].includes(c.method)&&!(c.method==='DELETE'&&c.url===base+'/robot/map-archives/'+item.id)).length,0);
 assert.equal(await db.service_documents.count({where:{id:{in:[item.id,item.id+':blob']}}}),0);
 assert.equal((await fetch(base+'/robot/map-archives/'+item.id+'/download',{headers:{cookie}})).status,404);
 const protection=await(await fetch(base+'/robot/map-archives/protection',{headers:{cookie}})).json();
 const screenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/archive-library.png',Buffer.from(screenshot.data,'base64'));
 await send('Page.reload');await wait(`document.body.innerText.includes('ไฟล์ STCM')&&document.querySelectorAll('article').length>0`);
 assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),false);
 assert.equal(errors.length,0);
 const report={at:new Date().toISOString(),passed:true,fixtureId:item.id,realPostgres:true,cancelSendsNoDelete:true,confirmationDeletesOnlyFixture:true,metadataAndBlobDeleted:true,reloadRemainsDeleted:true,protection,robotMutationRequests:0,errors};
 await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{
 await db.$disconnect();ws.close();await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{});
 const check=await fetch(base+'/robot/map-archives/'+item.id+'/download',{headers:{cookie}});if(check.ok)await fetch(base+'/robot/map-archives/'+item.id,{method:'DELETE',headers:{cookie}});
}
