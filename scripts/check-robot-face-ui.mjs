// UI-only fixtures: intercept every kiosk API request; never contact the backend or robot.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = 'reports/robot-face-2026-10-23';
await fs.mkdir(out, { recursive: true });
const target = await (await fetch('http://localhost:9229/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0; const pending = new Map(), errors = [], network = [];
ws.onmessage = event => {
  const d = JSON.parse(event.data);
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  if (d.method === 'Network.requestWillBeSent') network.push(d.params.request.url);
  if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
const wait = async expression => { const until = Date.now() + 45000; while (Date.now() < until) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 150)); } throw Error('Timeout: ' + expression); };
const screenshot = async name => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await fs.writeFile(`${out}/${name}.png`, Buffer.from(r.data, 'base64')); };
const click = async selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fixture = `(() => {
 sessionStorage.clear();
 window.__session={id:'00000000-0000-4000-8000-000000000001',revision:1,mode:'ai',messages:[]}; window.__uiCalls=[];
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
  const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
  if(!path.startsWith('/api/kiosk'))return nativeFetch(input,init);
  window.__uiCalls.push({path,method:init.method||'GET'});
  const json=data=>Response.json(data);
  if(path.endsWith('/ai-status'))return json({readiness:'model-and-rules',simulated:true,mockConnected:true});
  if(path.endsWith('/destinations'))return json({items:[{code:'DOOR',nameTh:'หน้าประตูห้อง',nameEn:'Room entrance'}]});
  if(path.endsWith('/messages')){
   const content=JSON.parse(init.body).content;
   await new Promise(r=>setTimeout(r,900));
   window.__session={...window.__session,revision:window.__session.revision+1,messages:[...window.__session.messages,{id:'user-1',role:'user',content,status:'complete'},{id:'reply-1',role:'assistant',content:'สวัสดีครับ ผมคือเฮอร์มีส ยินดีช่วยนำทางครับ',status:'complete'}]};
   return new Response(JSON.stringify({type:'session',session:window.__session})+'\\n'+JSON.stringify({type:'done'})+'\\n');
  }
  if(path.endsWith('/conversation'))return json({session:window.__session,token:'ui-only-token'});
  if(path.includes('/conversation/'))return json(window.__session);
  if(path.endsWith('/cancel'))return json({cancelled:true});
  throw Error('Unexpected UI request '+path);
 };
 class Recognition { start(){window.__recognition=this;} abort(){this.onend?.();} }
 window.SpeechRecognition=Recognition;
 window.__speakText=text=>window.__recognition.onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:text}}]});
 Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],addEventListener(){},removeEventListener(){},cancel(){},speak(u){window.__utterance=u;}}});
})();`;
const checks = [];
try {
 await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
 await send('Page.addScriptToEvaluateOnNewDocument', { source: fixture });
 await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
 await send('Page.navigate', { url: 'http://localhost:3001/ai' });
 await wait(`!!document.querySelector('.robot-face.mood-idle') && !document.querySelector('.robot-talk').disabled`);
 assert.equal(await evaluate(`document.querySelector('#robot-conversation').hidden`), true);
 await screenshot('face-desktop'); checks.push('Reference face is the default /ai screen');
 await click('.robot-talk'); await wait(`!!document.querySelector('.mood-listening')`);
 await screenshot('face-listening');
 await evaluate(`window.__speakText('สวัสดีครับ')`);
 await wait(`!document.querySelector('#robot-conversation').hidden && document.querySelector('.reception-compose input').value==='สวัสดีครับ'`);
 assert.equal(await evaluate(`window.__uiCalls.filter(c=>c.path.endsWith('/messages')).length`), 0);
 checks.push('Voice transcript opens chat for review without submitting');
 await evaluate(`document.querySelector('.reception-compose').requestSubmit()`);
 await wait(`!!document.querySelector('.mood-thinking')`);
 await wait(`document.querySelector('.reception-turns').textContent.includes('ยินดีช่วยนำทางครับ')`);
 await wait(`!!document.querySelector('.mood-idle')`);
 await click('.reception-turn.assistant button'); await wait(`!!document.querySelector('.mood-speaking')`);
 await evaluate(`window.__utterance.onend()`); await wait(`!!document.querySelector('.mood-idle')`);
 checks.push('Thinking and speaking expressions follow chat and TTS state');
 await click('.robot-destination-picker summary');
 await evaluate(`document.querySelector('.reception-destinations button').click()`);
 assert.equal(await evaluate(`document.querySelector('.reception-compose input').value`), 'พาไปหน้าประตูห้อง');
 assert.equal(await evaluate(`window.__uiCalls.filter(c=>c.path.endsWith('/messages')).length`), 1);
 checks.push('Choosing POI fills a draft without dispatch');
 await screenshot('face-chat-desktop');
 await click('[aria-label="ปิดบทสนทนา"]');
 assert.equal(await evaluate(`document.querySelectorAll('.reception-turn').length`), 2);
 for (const [name, width, height] of [['face-portrait',900,1440],['face-mobile',390,844],['face-short',1024,600]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await new Promise(r=>setTimeout(r,200));
  const bounds = await evaluate(`(()=>{const f=document.querySelector('.robot-face').getBoundingClientRect(),s=document.querySelector('.reception-stop').getBoundingClientRect(),b=document.querySelector('.robot-talk').getBoundingClientRect();return {faceVisible:f.width>200&&f.height>100,stopVisible:s.bottom<=innerHeight&&s.top>=0,talkVisible:b.bottom<=innerHeight&&b.top>=0,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  assert.ok(bounds.faceVisible && bounds.stopVisible && bounds.talkVisible && !bounds.overflow, JSON.stringify({name,bounds}));
  await screenshot(name);
  await click('.robot-open-chat'); await wait(`!document.querySelector('#robot-conversation').hidden`);
  const layout = await evaluate(`(()=>{const c=document.querySelector('.reception-chat').getBoundingClientRect();return {left:c.left,right:c.right,bottom:c.bottom,top:c.top,height:innerHeight,width:innerWidth}})()`);
  assert.ok(layout.left>=0 && layout.right<=layout.width && layout.top>=0 && layout.bottom<=layout.height, JSON.stringify(layout));
  await screenshot(name+'-chat'); await click('[aria-label="ปิดบทสนทนา"]');
  checks.push(name+' face, chat and stop control fit viewport');
 }
 await evaluate(`window.__session={...window.__session,revision:10,mode:'staff'}`);
 await wait(`!!document.querySelector('.mood-staff') && !document.querySelector('#robot-conversation').hidden`);
 checks.push('Staff takeover opens conversation automatically');
 await send('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.robot-face-features')).animationName`), 'none');
 checks.push('Reduced motion disables face animations');
 assert.equal(errors.length, 0, errors.join('\n'));
 assert.equal(network.filter(url=>url.includes('/api/kiosk') || /192\.168\.1\./.test(url)).length, 0);
 const report={at:new Date().toISOString(),passed:true,checks,backendRequests:0,robotRequests:0,speechAPIs:'UI stubs; no acoustic test',errors};
 await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally { ws.close(); await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{}); }
