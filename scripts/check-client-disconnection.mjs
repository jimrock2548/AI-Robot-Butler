// Disconnect ONLY a disposable browser tab. Robot/backend network and E-stop remain untouched.
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const target = await (await fetch('http://localhost:9229/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let seq=0; const pending=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(200);}throw Error('Timeout: '+expression);};
const output='reports/supervised-motion-2026-10-21';await fs.mkdir(output,{recursive:true});
const report={at:new Date().toISOString(),robotNetworkInterrupted:false,motionDispatched:false};
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Page.navigate',{url:'http://localhost:3000/login'});await wait(`document.readyState==='complete'`);
 await evaluate(`fetch('http://localhost:4000/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:${JSON.stringify(process.env.INITIAL_ADMIN_PASSWORD)}})}).then(r=>{if(!r.ok)throw Error('login failed')})`);
 await send('Page.navigate',{url:'http://localhost:3000/control'});await wait(`document.body.innerText.includes('● ออนไลน์')`);
 report.before=await evaluate('document.body.innerText.slice(0,2500)');
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await sleep(8500);
 report.offline=await evaluate('document.body.innerText.slice(0,2500)');
 report.networkReallyOffline=await evaluate(`fetch('http://localhost:4000/api/health',{cache:'no-store'}).then(()=>false).catch(()=>true)`);
 report.deadShown=report.offline.includes('○ ลิงก์ขาด');
 const image=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(output+'/client-offline.png',Buffer.from(image.data,'base64'));
 await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await wait(`document.body.innerText.includes('● ออนไลน์')`);report.reconnected=true;
 report.passed=report.networkReallyOffline&&report.deadShown&&report.reconnected;
 await fs.writeFile(output+'/client-disconnection.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,networkReallyOffline:report.networkReallyOffline,deadShown:report.deadShown,reconnected:report.reconnected}));
}finally{await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{});ws.close();await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{});}
