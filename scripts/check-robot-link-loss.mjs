// Observe the REAL backend link only. Requires E-stop already engaged; never sends robot commands.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/backend/package.json', import.meta.url));
require('dotenv').config({ path: new URL('../.env', import.meta.url) });
const phase = process.argv.find(v=>v.startsWith('--phase='))?.split('=')[1];
assert.ok(['before','blocked','recovered'].includes(phase));
const base='http://localhost:4000/api';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.INITIAL_ADMIN_PASSWORD})});assert.equal(login.status,200);
const headers={cookie:login.headers.get('set-cookie').split(';')[0]};
const file='reports/supervised-motion-2026-10-21/robot-link-loss.json';
const report=phase==='before'?{at:new Date().toISOString(),motionDispatched:false,estopRequired:true}:JSON.parse(await fs.readFile(file,'utf8'));
const samples=[];
for(let i=0;i<(phase==='before'?1:14);i++){
 const r=await fetch(base+'/robot/state',{headers,signal:AbortSignal.timeout(4000)});assert.ok(r.ok);const s=await r.json();
 assert.equal(s.simulated,false);assert.equal(s.mode,'stopped');assert.equal(s.currentJob,null);
 samples.push({at:new Date().toISOString(),link:s.linkStatus,lastSeenAt:s.lastSeenAt,mode:s.mode});
 if(phase==='recovered'&&s.linkStatus==='ok')break;
 if(phase!=='before')await new Promise(r=>setTimeout(r,1000));
}
report[phase]=samples;await fs.writeFile(file,JSON.stringify(report,null,2));
if(phase==='before')assert.equal(samples[0].link,'ok');
if(phase==='blocked')assert.ok(samples.some(s=>s.link==='dead'),'Real link never became dead');
if(phase==='recovered')assert.equal(samples.at(-1).link,'ok');
console.log(JSON.stringify({phase,statuses:[...new Set(samples.map(s=>s.link))],passed:true}));
