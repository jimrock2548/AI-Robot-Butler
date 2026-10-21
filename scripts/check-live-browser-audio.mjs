// Real browser APIs, no fake microphone/transcript/speech engine. No robot motion.
import fs from 'node:fs/promises';
const port = Number(process.argv.find(value => value.startsWith('--port='))?.split('=')[1] ?? 9229);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid debugging port');
const target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0; const pending = new Map();
ws.onmessage = e => { const d = JSON.parse(e.data); if (pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(d.error) : p.resolve(d.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
const delay = ms => new Promise(r => setTimeout(r, ms));
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3001/ai' });
  let ready = false;
  for (let i = 0; i < 100; i++) { ready = await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='ทดสอบลำโพง')`); if (ready) break; await delay(200); }
  if (!ready) throw new Error('Voice test UI did not load');
  const availability = await evaluate(`(async()=>({secure:isSecureContext,recognition:!!(window.SpeechRecognition||window.webkitSpeechRecognition),microphonePermission:await navigator.permissions.query({name:'microphone'}).then(v=>v.state).catch(()=> 'unknown'),devices:await navigator.mediaDevices.enumerateDevices().then(ds=>ds.map(d=>({kind:d.kind,label:d.label}))).catch(e=>({error:e.message})),voices:speechSynthesis.getVoices().map(v=>({name:v.name,lang:v.lang}))}))()`);
  await evaluate(`(()=>{window.__audioEvents=[];const realSpeak=speechSynthesis.speak.bind(speechSynthesis);speechSynthesis.speak=u=>{for(const name of ['start','end','error'])u.addEventListener(name,e=>window.__audioEvents.push({type:name,error:e.error??null,elapsedTime:e.elapsedTime,at:Date.now()}));realSpeak(u)};document.querySelector('details').open=true;const select=document.querySelector('[aria-label="เลือกเสียงพูด"]');if(select){const thai=[...select.options].find(o=>o.textContent.includes('Pattara'));if(thai){select.value=thai.value;select.dispatchEvent(new Event('change',{bubbles:true}))}}})()`);
  await delay(200);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='ทดสอบลำโพง').click()`);
  let events = [];
  for (let i = 0; i < 75; i++) { events = await evaluate('window.__audioEvents'); if (events.some(e=>e.type==='end'||e.type==='error')) break; await delay(200); }
  const enginePassed = events.some(e => e.type === 'end') && !events.some(e => e.type === 'error');
  const uiNotice = await evaluate(`document.querySelector('.reception-hint[role="status"]')?.textContent ?? ''`);
  const result = { at: new Date().toISOString(), browser: `Chrome CDP on local PC, debugging port ${port}`, realSpeechEngine: true, enginePassed, availability, events, uiNotice,
    physicalRobotSpeakerVerified: false, physicalRobotMicrophoneVerified: false, humanListeningRequired: true };
  await fs.mkdir('reports/remaining-tests-2026-10-21', { recursive: true });
  await fs.writeFile(`reports/remaining-tests-2026-10-21/browser-audio-${port}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ enginePassed, microphonePermission: availability.microphonePermission, devices: availability.devices, events, uiNotice }));
} finally { await evaluate('speechSynthesis.cancel()').catch(()=>{}); ws.close(); await fetch(`http://localhost:${port}/json/close/` + target.id).catch(()=>{}); }
