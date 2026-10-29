'use client';
import { useEffect, useRef, useState } from 'react';
import type { JobSummary, Lang, KioskDestination, ReceptionSession } from '@hermes/shared';
import { createConversation, readConversation, kioskAiStatus, kioskChat, kioskDestinations, kioskCancel } from '../../lib/api';
import { useBrowserVoice } from '../../lib/browserVoice';
import { RobotFace, type FaceMood } from './RobotFace';

export function ChatFlow({ lang, onClose, onJob, allowSpeech = true, arrivalJobId = null }: { lang: Lang; onClose: () => void; onJob: (job: JobSummary) => void; allowSpeech?: boolean; arrivalJobId?: number | null }) {
  const [session, setSession] = useState<ReceptionSession | null>(null);
  const [credentials, setCredentials] = useState<{ id: string; token: string } | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [destinations, setDestinations] = useState<KioskDestination[]>([]);
  const [simulated, setSimulated] = useState<boolean | null>(null);
  const [aiReadiness, setAiReadiness] = useState<'model-and-rules' | 'rules-only' | 'unavailable' | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [navigationOnly, setNavigationOnly] = useState<boolean | null>(null);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const credentialsRef = useRef<typeof credentials>(null);
  const seenSpeech = useRef(new Set<string>());
  const announcedArrivals = useRef(new Set<number>());
  const bottom = useRef<HTMLDivElement | null>(null);
  const voice = useBrowserVoice(lang, text => { setChatOpen(true); void sendQuestion(text); });
  const t = (th: string, en: string) => lang === 'th' ? th : en;
  const apply = (next: ReceptionSession) => setSession(old => !old || next.id !== old.id || next.revision >= old.revision ? next : old);
  const create = async () => {
    const result = await createConversation();
    if (!alive.current) return;
    const c = { id: result.session.id, token: result.token };
    credentialsRef.current = c; setCredentials(c); setSession(result.session); setInput(''); setError('');
  };
  useEffect(() => {
    alive.current = true; void create().catch(e => { if (alive.current) setError(e.message); });
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!credentials) return;
    let live = true, loading = false;
    const load = async () => {
      if (loading) return; loading = true;
      try { const next = await readConversation(credentials.id, credentials.token); if (live) apply(next); }
      catch (e) { if (live) setError(e instanceof Error ? e.message : 'อ่านแชตไม่ได้'); }
      finally { loading = false; }
    };
    const timer = window.setInterval(() => void load(), 1000);
    return () => { live = false; window.clearInterval(timer); };
  }, [credentials]);
  useEffect(() => {
    let live = true;
    const load = () => {
      kioskAiStatus().then(s => { if (live) { setSimulated(s.simulated); setAiReadiness(s.readiness); setNavigationOnly(typeof s.navigationOnly === 'boolean' ? s.navigationOnly : null); } }).catch(() => { if (live) { setAiReadiness(null); setNavigationOnly(null); } });
      kioskDestinations(lang).then(s => { if (live) setDestinations(s.items); }).catch(() => {});
    };
    load(); const timer = window.setInterval(load, 5000);
    return () => { live = false; clearInterval(timer); };
  }, [lang]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [session?.messages.at(-1)?.content]);
  useEffect(() => {
    const latest = session?.messages.at(-1);
    if (!latest || latest.role === 'user' || latest.status !== 'complete' || !latest.content || seenSpeech.current.has(latest.id)) return;
    seenSpeech.current.add(latest.id);
    if (autoSpeak && allowSpeech && (!arrivalJobId || latest.role === 'staff')) voice.speak(latest.content);
  }, [session, autoSpeak, allowSpeech, arrivalJobId]);
  useEffect(() => {
    if (!arrivalJobId || announcedArrivals.current.has(arrivalJobId)) return;
    announcedArrivals.current.add(arrivalJobId);
    if (autoSpeak && allowSpeech) voice.speak(t('ถึงจุดหมายแล้วครับ', 'We have arrived at the destination.'));
  }, [arrivalJobId, autoSpeak, allowSpeech]);
  useEffect(() => { if (!allowSpeech) { voice.stop(); voice.stopSpeaking(); } }, [allowSpeech]);
  useEffect(() => { if (session?.mode === 'staff') { controller.current?.abort(); setChatOpen(true); } }, [session?.mode]);
  const sendQuestion = async (text: string) => {
    const question = text.trim();
    if (!question || !credentials || busy || stopping) return;
    voice.stop(); voice.stopSpeaking(); setBusy(true); setInput(''); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      for await (const event of kioskChat([{ role: 'user', content: question }], lang, request.signal, credentials)) {
        if (!alive.current || credentialsRef.current?.id !== credentials.id) break;
        if (event.type === 'session') apply(event.session);
        if (event.type === 'done' && event.job) { onJob(event.job); return; }
      }
    } catch (e) { if (alive.current && !request.signal.aborted) { setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ'); setInput(question); } }
    finally {
      if (controller.current === request) controller.current = null;
      if (alive.current) { setBusy(false); void readConversation(credentials.id, credentials.token).then(next => { if (alive.current && credentialsRef.current?.id === credentials.id) apply(next); }).catch(() => {}); }
    }
  };
  const stopRobot = async () => {
    controller.current?.abort(); voice.stop(); voice.stopSpeaking(); setStopping(true); setError('');
    try { await kioskCancel(); } catch (e) { setError(e instanceof Error ? e.message : 'หยุดไม่สำเร็จ'); }
    finally { setStopping(false); }
  };
  const mood: FaceMood = error ? 'error' : voice.speaking ? 'speaking' : voice.listening ? 'listening'
    : busy ? 'thinking' : session?.mode === 'staff' ? 'staff' : 'idle';
  const faceStatus = mood === 'speaking' ? t('กำลังพูด', 'Speaking') : mood === 'listening' ? t('กำลังฟังคุณอยู่', 'Listening to you')
    : mood === 'thinking' ? t('กำลังคิดสักครู่…', 'Let me think…') : mood === 'staff' ? t('เจ้าหน้าที่กำลังดูแลคุณ', 'Staff is here to help')
    : mood === 'error' ? t('มีบางอย่างติดขัด เปิดแชตเพื่อดูรายละเอียด', 'Open chat to see what went wrong')
    : t('สวัสดีครับ ให้ผมพาไปที่ไหน?', 'Hello! Where shall we go?');
  return <div className={`reception-shell robot-interface ${chatOpen ? 'chat-open' : ''}`}>
    <header className="reception-header">
      <div className="robot-wordmark"><strong>HERMES<span className="robot-wordmark-dot">●</span></strong><span>YOUR NAVIGATION COMPANION</span></div>
      <div className="robot-connection"><span className="robot-link-dot" data-ready={aiReadiness === 'model-and-rules' || aiReadiness === 'rules-only'} /><span>{simulated === null ? t('กำลังเชื่อมต่อ', 'Connecting') : simulated ? t('หุ่นจำลอง', 'Simulated robot') : t('หุ่นจริง', 'Live robot')}</span></div>
      <button type="button" className="reception-button robot-home" onClick={() => { controller.current?.abort(); voice.stop(); voice.stopSpeaking(); onClose(); }}>{t('หน้าหลัก', 'Home')} ↗</button>
    </header>
    <div className="robot-stage">
      <section className={`robot-face-stage ${voice.checked && (!voice.secure || !voice.supported) ? 'has-mic-help' : ''}`} aria-label={t('ใบหน้าเฮอร์มีส', 'Hermes face')}>
        <button type="button" className="robot-face-touch" onClick={() => setChatOpen(true)} aria-label={t('เปิดบทสนทนากับเฮอร์มีส', 'Open conversation with Hermes')}>
          <RobotFace mood={mood} label={faceStatus} />
        </button>
        <div className="robot-greeting"><span className="robot-eyebrow">{mood === 'idle' ? 'NICE TO SEE YOU' : mood.toUpperCase()}</span><h1 role="status">{faceStatus}</h1><p>{voice.notice || t('กดพูด หรือพิมพ์จุดหมาย แล้วให้ผมช่วยนำทาง', 'Speak or type your destination. I will help you get there.')}</p></div>
        {voice.checked && (!voice.secure || !voice.supported) && <div className="robot-mic-help" role="status">
          {!voice.secure ? <><p>{t('ไมค์บน iPad ต้องใช้ HTTPS ที่เชื่อถือได้', 'Microphone access on iPad requires trusted HTTPS')}</p><a href={voice.httpsUrl}>{t('เปิดหน้า AI ผ่าน HTTPS', 'Open AI over HTTPS')} ↗</a><a href="/hermes-lab-root.cer" download>{t('ดาวน์โหลดใบรับรองห้องแลปสำหรับ iPad', 'Download the lab certificate for iPad')}</a><p>{t('ติดตั้งใบรับรองและเปิด Full Trust ใน Settings ก่อนใช้ HTTPS', 'Install the certificate and enable Full Trust in Settings first.')}</p></>
          : <p>{t('เบราว์เซอร์นี้ไม่มีระบบถอดเสียง ลองเปิดด้วย Safari และเปิด Siri หรือใช้ไมค์บนแป้นพิมพ์แทน', 'Speech recognition is unavailable. Try Safari with Siri enabled, or use keyboard dictation.')}</p>}
        </div>}
        {autoSpeak && (!voice.speechUnlocked || voice.speechError) && <div className="robot-speech-help">
          <button type="button" className="reception-button" disabled={busy || stopping || voice.listening || voice.speechStarting} onClick={voice.enableSpeech}>{voice.speechStarting ? t('กำลังเริ่มเสียง…', 'Starting audio…') : t('เปิดเสียงตอบกลับ', 'Enable voice replies')} 🔊</button>
          <p role="status">{voice.speechError || t('แตะหนึ่งครั้งเพื่อเริ่มเสียงอ่านบน iPad', 'Tap once to start spoken replies on iPad.')}</p>
        </div>}
        <div className="robot-primary-actions">
          <button type="button" className={`robot-talk ${voice.listening ? 'is-listening' : ''}`} disabled={!credentials || busy || stopping} onClick={() => voice.listening ? voice.stop() : voice.start(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></svg>{voice.listening ? t('หยุดฟัง', 'Stop listening') : t('พูดกับเฮอร์มีส', 'Talk to Hermes')}</button>
          <button type="button" className="reception-button robot-open-chat" aria-expanded={chatOpen} aria-controls="robot-conversation" onClick={() => setChatOpen(open => !open)}>{chatOpen ? t('ดูใบหน้าเต็มจอ', 'Show full face') : t('พิมพ์ข้อความ / จุดหมาย', 'Type / destinations')} <span aria-hidden="true">↗</span></button>
        </div>
      </section>
      <section id="robot-conversation" className="reception-chat" aria-label="บทสนทนา" hidden={!chatOpen}>
        <div className="reception-chat-title"><div><span className="robot-eyebrow">LET’S TALK</span><strong>{t('คุยกับเฮอร์มีส', 'Talk to Hermes')}</strong></div><button type="button" className="reception-button" aria-label={t('ปิดบทสนทนา', 'Close conversation')} onClick={() => setChatOpen(false)}>✕</button></div>
        <div className="robot-chat-tools"><span className="reception-badge">{session?.mode === 'staff' ? t('เจ้าหน้าที่กำลังดูแล', 'Staff is assisting') : aiReadiness === 'model-and-rules' ? t('AI Local พร้อม', 'Local AI ready') : aiReadiness === 'rules-only' ? t('คำสั่งพื้นฐานพร้อม · LLM ยังไม่พร้อม', 'Basic commands ready · LLM unavailable') : aiReadiness === 'unavailable' ? t('AI ยังไม่พร้อม', 'AI unavailable') : t('กำลังตรวจสถานะ AI', 'Checking AI readiness')}</span><button className="reception-button" disabled={busy} onClick={() => { voice.stop(); voice.stopSpeaking(); void create().catch(e => setError(e.message)); }}>{t('เริ่มใหม่', 'New chat')}</button></div>
        <details className="robot-destination-picker"><summary>{t('เลือกจุดหมาย', 'Choose a destination')} <span>↗</span></summary><div className="reception-destinations">{destinations.map(p => <button disabled={busy || stopping || session?.mode === 'staff'} key={p.code} onClick={() => setInput(t(`พาไป${p.nameTh}`, `Take me to ${p.nameEn}`))}>{lang === 'th' ? p.nameTh : p.nameEn} ↗</button>)}{!destinations.length && <p>{t('ยังไม่มีจุดหมายพร้อมใช้งาน', 'No destinations available yet')}</p>}<button disabled={busy || stopping || session?.mode === 'staff'} onClick={() => setInput(t('กลับจุดชาร์จ', 'Return to charging station'))}>{t('กลับจุดชาร์จ', 'Return to charger')} ↗</button></div></details>
        <div className="reception-turns" aria-live="polite">
          {!session?.messages.length && <p className="reception-welcome">{t('สวัสดีครับ เลือกจุดหมายที่ต้องการได้เลย หากต้องการเจ้าหน้าที่ กรุณาแจ้งในช่องสนทนา', 'Hello! Choose your destination. If you need staff, let us know in the conversation.')}</p>}
          {session?.messages.map(m => <article key={m.id} className={`reception-turn ${m.role}`}>
            <small>{m.role === 'user' ? t('คุณ', 'You') : m.role === 'staff' ? t('เจ้าหน้าที่', 'Staff') : 'Hermes'}</small>
            <p>{m.content || (m.status === 'streaming' ? t('กำลังตอบ…', 'Responding…') : '')}</p>
            {m.status === 'cancelled' && <small>{t('ยกเลิกคำตอบแล้ว', 'Response cancelled')}</small>}
            {m.status === 'error' && <small>{t('ตอบไม่สำเร็จ กรุณาลองใหม่', 'Response failed. Please retry.')}</small>}
            {m.role !== 'user' && m.status === 'complete' && m.content && <button onClick={() => voice.speak(m.content)} aria-label={t('อ่านออกเสียง', 'Read aloud')}>🔊</button>}
          </article>)}<div ref={bottom} />
        </div>
        {error && <p role="alert" className="reception-error">{error}</p>}
        <div className="reception-voice">
          {autoSpeak && (!voice.speechUnlocked || voice.speechError) && <button type="button" className="reception-button" disabled={busy || stopping || voice.listening || voice.speechStarting} onClick={voice.enableSpeech}>{voice.speechStarting ? t('กำลังเริ่มเสียง…', 'Starting audio…') : t('เปิดเสียงตอบกลับ', 'Enable voice replies')} 🔊</button>}
          <button className="reception-button" disabled={!credentials || busy || stopping} onClick={() => voice.listening ? voice.stop() : voice.start(false)}>{voice.listening ? t('ปิดไมค์', 'Stop listening') : t('กดพูด', 'Speak')}</button>
          <button className="reception-button" disabled={!credentials || busy || stopping || !voice.wakePhrase.trim()} onClick={() => voice.start(true)}>{t('ฟังคำเรียก', 'Listen for wake word')}</button>
          <input aria-label="คำเรียกหุ่น" maxLength={50} value={voice.wakePhrase} onChange={e => { voice.stop(); voice.setWakePhrase(e.target.value); }} />
          <label><input type="checkbox" checked={autoSpeak} onChange={e => { setAutoSpeak(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); else voice.enableSpeech(); }} />{t('อ่านคำตอบ', 'Speak replies')}</label>
          {(voice.speaking || voice.speechStarting) && <button className="reception-button" onClick={voice.stopSpeaking}>{t('หยุดเสียง', 'Stop speaking')}</button>}
        </div>
        <p className="reception-hint" role="status">{voice.notice || t('พูดจบแล้วระบบจะส่งข้อความอัตโนมัติ', 'Your message is sent automatically when you finish speaking.')}</p>
        <details className="reception-hint">
          <summary>{t('ตั้งค่าและตรวจสอบเสียงบนอุปกรณ์นี้', 'Voice settings on this device')}</summary>
          <p role="status">{voice.speechStarting ? t('กำลังรอระบบเสียงเริ่มทำงาน', 'Waiting for speech to start') : voice.speechUnlocked ? t('ระบบเสียงรายงานว่าเริ่มอ่านได้แล้ว', 'Speech engine has started successfully') : t('ยังไม่ได้เริ่มเสียงอ่าน แตะเปิดเสียงตอบกลับหรือทดสอบลำโพง', 'Tap Enable voice replies or Test speaker to start speech')}</p>
          {voice.speechError && <p role="alert">{voice.speechError}</p>}
          <button className="reception-button" type="button" disabled={voice.checkingMic || busy || stopping} onClick={() => void voice.checkMicrophone()}>{voice.checkingMic ? t('กำลังขอสิทธิ์ไมค์…', 'Requesting microphone…') : t('ตรวจสิทธิ์ไมโครโฟน', 'Check microphone permission')}</button>
          <p>{t('บน iPad ใช้ Safari เปิด Siri และอนุญาตไมโครโฟนในการตั้งค่าเว็บไซต์ หากไม่รองรับ ใช้ไมค์บนแป้นพิมพ์พิมพ์ลงช่องข้อความได้', 'On iPad, use Safari with Siri enabled and allow microphone access in website settings. Keyboard dictation is also available as an alternative.')}</p>
          <p>{t('รับเสียง', 'Recognition')}: {voice.supported ? 'รองรับ' : 'ไม่รองรับ'} · {voice.secure ? 'HTTPS / localhost พร้อม' : 'ต้องเปิด HTTPS / localhost เพื่อใช้ไมค์'}</p>
          <label>{t('เสียงพูด', 'Voice')} <select aria-label="เลือกเสียงพูด" value={voice.voiceUri} onChange={e => voice.setVoiceUri(e.target.value)}><option value="">{t('อัตโนมัติตามภาษา', 'Automatic')}</option>{voice.voices.map(v => <option key={v.uri} value={v.uri}>{v.name} · {v.lang}</option>)}</select></label>
          <label>{t('อัตราพูด', 'Speech rate')} <input aria-label="อัตราพูด" type="range" min="0.6" max="1.4" step="0.1" value={voice.rate} onChange={e => voice.setRate(Number(e.target.value))} />{voice.rate.toFixed(1)}×</label>
          <button className="reception-button" type="button" onClick={() => voice.speak(t('สวัสดีครับ ฉันคือเฮอร์มีส ผู้ช่วยนำทางของคุณ', 'Hello, I am Hermes, your navigation assistant.'))}>{t('ทดสอบลำโพง', 'Test speaker')}</button>
          <p>{t('ทดสอบไมค์ด้วยปุ่มกดพูดหรือฟังคำเรียก เมื่อพูดจบข้อความจะถูกส่งอัตโนมัติ', 'Use Speak or Listen for wake word to test the microphone. The message is sent automatically when you finish speaking.')}</p>
        </details>
        {voice.speechError && <p role="alert" className="reception-error">{voice.speechError}</p>}
        <form className="reception-compose" onSubmit={e => { e.preventDefault(); void sendQuestion(input); }}>
          <input aria-label={t('ข้อความหรือคำสั่งนำทาง', 'Message or navigation request')} maxLength={500} disabled={!credentials || busy || stopping} value={input} onChange={e => setInput(e.target.value)} placeholder={session?.mode === 'staff' ? t('พิมพ์คุยกับเจ้าหน้าที่…', 'Message staff…') : t('เช่น ช่วยพาไปห้องประชุมหน่อย', 'e.g. Please take me to the meeting room')} />
          <button disabled={!credentials || !input.trim() || busy || stopping}>{busy ? '…' : t('ส่ง', 'Send')}</button>
          {busy && <button type="button" onClick={() => controller.current?.abort()}>{t('ยกเลิก', 'Cancel')}</button>}
        </form>
        <p className="reception-hint">{t('รับเสียงผ่านเบราว์เซอร์อาจใช้อินเทอร์เน็ตและส่งเสียงไปยังผู้ให้บริการ · แชตแสดงให้เจ้าหน้าที่ดูแลบริการ', 'Browser speech recognition may send audio to its provider and require internet. Staff can view this service conversation.')}</p>
      </section>
    </div>
    <footer className="robot-footer"><div><span>{t('ผู้ช่วยนำทางของคุณ', 'Your navigation companion')}</span><span className="robot-ai-scope" role="status">{navigationOnly === null ? t('กำลังตรวจโหมด AI…', 'Checking AI mode…') : navigationOnly ? t('AI · เฉพาะนำทาง', 'AI · Navigation only') : t('AI · สนทนาและค้นเว็บ', 'AI · Chat and web search')}</span></div><button className="reception-stop" disabled={stopping} onClick={() => void stopRobot()}><span aria-hidden="true">■</span> {stopping ? t('กำลังหยุด…', 'Stopping…') : t('หยุด / ยกเลิกงาน', 'Stop / cancel navigation')}</button></footer>
  </div>;
}
