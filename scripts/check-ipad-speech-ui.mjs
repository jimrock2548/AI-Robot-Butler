// Simulate WebKit's first-speech gesture restriction. No real speech, microphone, AI or robot requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='reports/ipad-speech-2026-10-29';await fs.mkdir(out,{recursive:true});
const target=await(await fetch('http://localhost:9229/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map(),errors=[],network=[];
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.method==='Runtime.exceptionThrown')errors.push(d.params.exceptionDetails.exception?.description??d.params.exceptionDetails.text);if(d.method==='Network.requestWillBeSent')network.push(d.params.request.url);if(pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+expression);};
const clickText=text=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
const fixture=`(()=>{
 sessionStorage.clear();window.__played=[];window.__calls=[];window.__gesture=false;window.__unlocked=false;window.__speechError='';window.__resumes=0;window.__creates=0;window.__cancels=0;
 document.addEventListener('click',()=>{window.__gesture=true;queueMicrotask(()=>window.__gesture=false);},true);
 window.__session={id:'00000000-0000-4000-8000-000000000001',revision:1,mode:'ai',messages:[]};const native=fetch;
 window.fetch=async(input,init={})=>{const p=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(!p.startsWith('/api/kiosk/'))return native(input,init);
 if(p.endsWith('/ai-status'))return Response.json({readiness:'model-and-rules',navigationOnly:true,simulated:true});
 if(p.endsWith('/destinations'))return Response.json({items:[]});
 if(p.endsWith('/conversation')){window.__creates++;return Response.json({session:window.__session,token:'test-only'});}
 if(p.endsWith('/messages')){
  const ack='ได้ครับ ตามผมมาได้เลยครับ';window.__job={id:9876,ref:'UI-ONLY',status:'navigating',source:'kiosk_voice',destName:'หน้าประตูห้อง',destPoiCode:'DOOR',progress:.1,etaSec:15,remainingM:2,distanceM:3,mapVersion:1,requestedByName:null,createdAt:new Date().toISOString()};
  window.__session={...window.__session,revision:window.__session.revision+1,messages:[...window.__session.messages,{id:'nav-ack',role:'assistant',content:ack,status:'streaming'}]};
  const stream=JSON.stringify({type:'session',session:window.__session})+'\\n'+JSON.stringify({type:'delta',text:ack})+'\\n'+JSON.stringify({type:'done',job:window.__job})+'\\n';
  setTimeout(()=>{window.__session={...window.__session,revision:window.__session.revision+1,messages:window.__session.messages.map(m=>m.id==='nav-ack'?{...m,status:'complete'}:m)};},200);
  return new Response(stream);
 }
 if(p.includes('/session/'))return Response.json({job:window.__job,map:null,robot:null,lang:'th'});
 if(p.includes('/conversation/'))return Response.json(window.__session);throw Error('Unexpected API '+p);};
 window.SpeechRecognition=class{start(){}abort(){this.onend?.();}};
 window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 Object.defineProperty(window,'speechSynthesis',{value:{
  getVoices:()=>[{name:'Thai fixture',lang:'th-TH',voiceURI:'thai-fixture'}],addEventListener(){},removeEventListener(){},resume(){window.__resumes++;},cancel(){window.__cancels++;},
  speak(u){window.__calls.push({text:u.text,gesture:window.__gesture});
   if(!window.__unlocked&&!window.__gesture)return;
   window.__unlocked=true;window.__utterance=u;
   if(window.__speechError){queueMicrotask(()=>u.onerror?.({error:window.__speechError}));return;}
   window.__played.push(u.text);queueMicrotask(()=>u.onstart?.());
  }
 }});
 window.__answer=(id,text)=>{window.__session={...window.__session,revision:window.__session.revision+1,messages:[...window.__session.messages,{id,role:'assistant',content:text,status:'complete'}]};};
})();`;
const checks=[];
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
 await send('Emulation.setDeviceMetricsOverride',{width:820,height:1180,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:'http://localhost:3001/ai'});
 await wait(`!!document.querySelector('.robot-speech-help button')&&!document.querySelector('.robot-talk').disabled`);
 await evaluate(`window.__answer('a1','สวัสดีครับ นี่คือคำตอบที่รออ่าน')`);
 await wait(`document.body.innerText.includes('ยังไม่ได้รับสัญญาณเริ่มเสียง')`);
 assert.equal(await evaluate('window.__played.length'),0);assert.equal(await evaluate(`!!document.querySelector('.mood-speaking')`),false);
 checks.push('Silent WebKit block times out without leaving the face stuck speaking');
 await clickText('เปิดเสียงตอบกลับ 🔊');
 await wait(`window.__played.length===1&&!!document.querySelector('.mood-speaking')`);
 assert.equal(await evaluate('window.__played[0]'),'สวัสดีครับ นี่คือคำตอบที่รออ่าน');
 assert.equal(await evaluate('window.__calls.at(-1).gesture'),true);
 await evaluate('window.__utterance.onend()');
 checks.push('Real click path invokes speech synchronously and retries the pending AI answer');
 await evaluate(`window.__answer('a2','คำตอบถัดไปอ่านอัตโนมัติ')`);
 await wait(`window.__played.length===2`);assert.equal(await evaluate('window.__calls.at(-1).gesture'),false);
 await evaluate('window.__utterance.onend()');
 await new Promise(r=>setTimeout(r,1300));assert.equal(await evaluate('window.__played.length'),2);
 checks.push('Subsequent complete answers auto-read once across conversation polling');
 await evaluate(`document.querySelector('.robot-open-chat').click()`);
 const auto=`[...document.querySelectorAll('label')].find(l=>l.textContent.includes('อ่านคำตอบ')).querySelector('input')`;
 assert.equal(await evaluate(`${auto}.checked`),true);
 await evaluate(`${auto}.click();window.__answer('a3','ปิดเสียงแล้วไม่ต้องอ่าน')`);
 await wait(`document.querySelector('.reception-turns').textContent.includes('ปิดเสียงแล้วไม่ต้องอ่าน')`);
 assert.equal(await evaluate('window.__played.length'),2);
 checks.push('Automatic reading is on by default and user can disable it');
 await evaluate(`${auto}.click()`);await wait(`window.__played.length===3`);await evaluate('window.__utterance.onend()');
 await evaluate(`window.__speechError='language-unavailable'`);await clickText('ทดสอบลำโพง');
 await wait(`document.body.innerText.includes('ติดตั้งเสียงภาษาไทย')`);
 assert.equal(await evaluate(`!!document.querySelector('.mood-speaking')`),false);
 checks.push('Unavailable language produces an actionable Thai voice error');
 await evaluate(`window.__speechError='not-allowed'`);await clickText('เปิดเสียงตอบกลับ 🔊');
 await wait(`document.body.innerText.includes('Safari ยังไม่อนุญาต')`);
 checks.push('Explicit not-allowed error asks for a user gesture and keeps retry available');
 await evaluate(`window.__speechError=''`);await clickText('เปิดเสียงตอบกลับ 🔊');await wait(`!!document.querySelector('.mood-speaking')`);
 await clickText('หยุดเสียง');await wait(`!document.querySelector('.mood-speaking')`);
 assert.ok(await evaluate('window.__resumes>0'));
 const creates=await evaluate('window.__creates');
 await evaluate(`(()=>{const e=document.querySelector('.reception-compose input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'พาไปหน้าประตูห้อง');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await wait(`!document.querySelector('.reception-compose button').disabled`);
 await evaluate(`document.querySelector('.reception-compose').requestSubmit()`);
 await wait(`document.body.innerText.includes('กำลังพาไป')&&window.__played.includes('ได้ครับ ตามผมมาได้เลยครับ')`);
 const cancels=await evaluate('window.__cancels');await new Promise(r=>setTimeout(r,1200));
 assert.equal(await evaluate('window.__cancels'),cancels,'switching to escort must not cancel acknowledgement');
 assert.equal(await evaluate(`window.__played.filter(t=>t==='ได้ครับ ตามผมมาได้เลยครับ').length`),1);
 checks.push('Accepted navigation keeps chat mounted and reads acknowledgement once on the escort screen');
 await evaluate(`window.__job={...window.__job,status:'arrived',progress:1}`);
 await wait(`document.body.innerText.includes('ถึงแล้วครับ')`);
 const arrivedAt=Date.now();
 await wait(`window.__played.includes('ถึงจุดหมายแล้วครับ')`);
 await new Promise(r=>setTimeout(r,1200));
 assert.equal(await evaluate(`window.__played.filter(t=>t==='ถึงจุดหมายแล้วครับ').length`),1);
 checks.push('Confirmed arrival is announced once and the waiting-return stop button is visible');
 assert.ok(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('ยกเลิกกลับจุดประจำ')&&b.getBoundingClientRect().height>0)`));
 await wait(`!!document.querySelector('.robot-interface')&&getComputedStyle(document.querySelector('.robot-interface').parentElement).display!=='none'`);
 assert.ok(Date.now()-arrivedAt>=4500,'arrival screen must wait approximately five seconds before opening AI');
 assert.equal(await evaluate(`sessionStorage.getItem('hermes.kioskJobId')`),null);
 assert.equal(await evaluate('window.__creates'),creates);
 assert.ok(await evaluate(`document.querySelector('.reception-turns').textContent.includes('ได้ครับ ตามผมมาได้เลยครับ')`));
 checks.push('After five seconds arrival automatically returns to the same AI conversation without repeating the acknowledgement');
 const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(out+'/speech-enabled.png',Buffer.from(shot.data,'base64'));
 assert.equal(errors.length,0);assert.equal(network.filter(u=>u.includes('/api/kiosk/')||u.includes(':4000')).length,0);
 const report={at:new Date().toISOString(),passed:true,gestureRestrictionSimulated:true,realIPadAudioTest:false,backendRequests:0,robotRequests:0,checks,errors};
 await fs.writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.log(JSON.stringify(await evaluate(`({body:document.body.innerText,calls:window.__calls,played:window.__played,session:window.__session,errors:${JSON.stringify(errors)}})`),null,2));throw error;}
finally{ws.close();await fetch('http://localhost:9229/json/close/'+target.id).catch(()=>{});}
