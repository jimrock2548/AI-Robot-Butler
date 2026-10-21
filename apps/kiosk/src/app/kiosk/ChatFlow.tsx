'use client';
import { useEffect, useRef, useState } from 'react';
import type { JobSummary, Lang, KioskDestination, ReceptionSession } from '@hermes/shared';
import { createConversation, readConversation, kioskAiStatus, kioskChat, kioskDestinations, kioskCancel } from '../../lib/api';
import { useBrowserVoice } from '../../lib/browserVoice';

export function ChatFlow({ lang, onClose, onJob }: { lang: Lang; onClose: () => void; onJob: (job: JobSummary) => void }) {
  const [session, setSession] = useState<ReceptionSession | null>(null);
  const [credentials, setCredentials] = useState<{ id: string; token: string } | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [destinations, setDestinations] = useState<KioskDestination[]>([]);
  const [simulated, setSimulated] = useState<boolean | null>(null);
  const [aiReadiness, setAiReadiness] = useState<'model-and-rules' | 'rules-only' | 'unavailable' | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const credentialsRef = useRef<typeof credentials>(null);
  const seenSpeech = useRef(new Set<string>());
  const bottom = useRef<HTMLDivElement | null>(null);
  const voice = useBrowserVoice(lang, text => setInput(text));
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
      kioskAiStatus().then(s => { if (live) { setSimulated(s.simulated); setAiReadiness(s.readiness); } }).catch(() => { if (live) setAiReadiness(null); });
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
    if (autoSpeak) voice.speak(latest.content);
  }, [session, autoSpeak]);
  useEffect(() => { if (session?.mode === 'staff') controller.current?.abort(); }, [session?.mode]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); const question = input.trim();
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
  return <div className="reception-shell">
    <header className="reception-header">
      <button type="button" className="reception-button" onClick={() => { controller.current?.abort(); voice.stop(); voice.stopSpeaking(); onClose(); }}>← {t('กลับ', 'Back')}</button>
      <div><strong>HERMES</strong><span>{t('ผู้ช่วยนำทางของคุณ', 'Your navigation assistant')}</span></div>
      <button className="reception-button" disabled={busy} onClick={() => { voice.stop(); voice.stopSpeaking(); void create().catch(e => setError(e.message)); }}>{t('เริ่มใหม่', 'New chat')}</button>
    </header>
    <div className="reception-body">
      <aside className="reception-guide">
        <div className={`reception-avatar ${voice.speaking ? 'is-speaking' : ''}`} aria-label="ผู้ช่วยเฮอร์มีส"><div className="reception-eyes"><i /><i /></div><div className="reception-smile" /></div>
        <h1>{session?.mode === 'staff' ? t('เจ้าหน้าที่กำลังดูแลคุณ', 'Staff is assisting you') : t('ให้ฉันพาไปไหมครับ?', 'Where shall we go?')}</h1>
        <p>{t('เลือกจุดหมาย พิมพ์ หรือกดพูด แล้วให้ฉันช่วยนำทาง', 'Choose a destination, type or speak to request navigation.')}</p>
        <span className="reception-badge">{simulated === null ? t('กำลังเชื่อมต่อ', 'Connecting') : simulated ? t('หุ่นจำลอง', 'Simulated robot') : t('เชื่อมกับหุ่นจริง', 'Live robot')}</span>
        <span className="reception-badge" role="status">{aiReadiness === 'model-and-rules' ? t('AI Local พร้อม', 'Local AI ready')
          : aiReadiness === 'rules-only' ? t('คำสั่งพื้นฐานพร้อม · LLM ยังไม่พร้อม', 'Basic commands ready · LLM unavailable')
          : aiReadiness === 'unavailable' ? t('AI ยังไม่พร้อม', 'AI unavailable') : t('กำลังตรวจสถานะ AI', 'Checking AI readiness')}</span>
        <div className="reception-destinations">{destinations.map(p => <button disabled={busy || session?.mode === 'staff'} key={p.code} onClick={() => setInput(t(`พาไป${p.nameTh}`, `Take me to ${p.nameEn}`))}>{lang === 'th' ? p.nameTh : p.nameEn} ↗</button>)}</div>
        <button className="reception-button" disabled={busy || session?.mode === 'staff'} onClick={() => setInput(t('กลับจุดชาร์จ', 'Return to charging station'))}>{t('กลับจุดชาร์จ', 'Return to charger')}</button>
        <button className="reception-stop" disabled={stopping} onClick={() => void stopRobot()}>{t('หยุด / ยกเลิกงาน', 'Stop / cancel navigation')}</button>
      </aside>
      <section className="reception-chat" aria-label="บทสนทนา">
        <div className="reception-chat-title"><strong>{t('สนทนากับเรา', 'Talk to us')}</strong><span>{session?.mode === 'staff' ? t('เจ้าหน้าที่', 'Staff') : 'AI'}</span></div>
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
          <button className="reception-button" disabled={!voice.supported || busy} onClick={() => voice.listening ? voice.stop() : voice.start(false)}>{voice.listening ? t('ปิดไมค์', 'Stop listening') : t('กดพูด', 'Speak')}</button>
          <button className="reception-button" disabled={!voice.supported || busy || !voice.wakePhrase.trim()} onClick={() => voice.start(true)}>{t('ฟังคำเรียก', 'Listen for wake word')}</button>
          <input aria-label="คำเรียกหุ่น" maxLength={50} value={voice.wakePhrase} onChange={e => { voice.stop(); voice.setWakePhrase(e.target.value); }} />
          <label><input type="checkbox" checked={autoSpeak} onChange={e => { setAutoSpeak(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }} />{t('อ่านคำตอบ', 'Speak replies')}</label>
          {voice.speaking && <button className="reception-button" onClick={voice.stopSpeaking}>{t('หยุดเสียง', 'Stop speaking')}</button>}
        </div>
        <p className="reception-hint" role="status">{voice.notice || t('รับเสียงแล้วให้ตรวจข้อความก่อนกดส่ง', 'Review recognized text before sending.')}</p>
        <details className="reception-hint">
          <summary>{t('ตั้งค่าและตรวจสอบเสียงบนอุปกรณ์นี้', 'Voice settings on this device')}</summary>
          <p>{t('รับเสียง', 'Recognition')}: {voice.supported ? 'รองรับ' : 'ไม่รองรับ'} · {voice.secure ? 'HTTPS / localhost พร้อม' : 'ต้องเปิด HTTPS / localhost เพื่อใช้ไมค์'}</p>
          <label>{t('เสียงพูด', 'Voice')} <select aria-label="เลือกเสียงพูด" value={voice.voiceUri} onChange={e => voice.setVoiceUri(e.target.value)}><option value="">{t('อัตโนมัติตามภาษา', 'Automatic')}</option>{voice.voices.map(v => <option key={v.uri} value={v.uri}>{v.name} · {v.lang}</option>)}</select></label>
          <label>{t('อัตราพูด', 'Speech rate')} <input aria-label="อัตราพูด" type="range" min="0.6" max="1.4" step="0.1" value={voice.rate} onChange={e => voice.setRate(Number(e.target.value))} />{voice.rate.toFixed(1)}×</label>
          <button className="reception-button" type="button" onClick={() => voice.speak(t('สวัสดีครับ ฉันคือเฮอร์มีส ผู้ช่วยนำทางของคุณ', 'Hello, I am Hermes, your navigation assistant.'))}>{t('ทดสอบลำโพง', 'Test speaker')}</button>
          <p>{t('ทดสอบไมค์ด้วยปุ่มกดพูดหรือฟังคำเรียก ข้อความจะปรากฏให้ตรวจสอบก่อนกดส่ง', 'Use Speak or Listen for wake word to test the microphone. Review the transcript before sending.')}</p>
        </details>
        <form className="reception-compose" onSubmit={e => void send(e)}>
          <input aria-label={t('ข้อความหรือคำสั่งนำทาง', 'Message or navigation request')} maxLength={500} disabled={!credentials || busy || stopping} value={input} onChange={e => setInput(e.target.value)} placeholder={session?.mode === 'staff' ? t('พิมพ์คุยกับเจ้าหน้าที่…', 'Message staff…') : t('เช่น ช่วยพาไปห้องประชุมหน่อย', 'e.g. Please take me to the meeting room')} />
          <button disabled={!credentials || !input.trim() || busy || stopping}>{busy ? '…' : t('ส่ง', 'Send')}</button>
          {busy && <button type="button" onClick={() => controller.current?.abort()}>{t('ยกเลิก', 'Cancel')}</button>}
        </form>
        <p className="reception-hint">{t('รับเสียงผ่านเบราว์เซอร์อาจใช้อินเทอร์เน็ตและส่งเสียงไปยังผู้ให้บริการ · แชตแสดงให้เจ้าหน้าที่ดูแลบริการ', 'Browser speech recognition may send audio to its provider and require internet. Staff can view this service conversation.')}</p>
      </section>
    </div>
  </div>;
}
