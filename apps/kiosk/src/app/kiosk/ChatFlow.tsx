'use client';

import { useEffect, useRef, useState } from 'react';
import type { JobSummary, Lang, KioskDestination } from '@hermes/shared';
import { kioskAiStatus, kioskChat, kioskDestinations, kioskCancel, type KioskChatMessage, type KioskChatSource } from '../../lib/api';

const u = (n: number) => `calc(${n} * var(--u))`;
type Turn = KioskChatMessage & { sources?: KioskChatSource[] };

export function ChatFlow({ lang, onClose, onJob }: { lang: Lang; onClose: () => void; onJob: (job: JobSummary) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ textReady: boolean; webReady: boolean; simulated: boolean; mockConnected?: boolean } | null>(null);
  const [destinations, setDestinations] = useState<KioskDestination[]>([]);
  const [stopping, setStopping] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const t = (th: string, en: string) => lang === 'th' ? th : en;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    let live = true;
    const load = () => {
      kioskAiStatus().then((next) => { if (live) setStatus(next); }).catch(() => {});
      kioskDestinations(lang).then(next => { if (live) setDestinations(next.items); }).catch(() => {});
    };
    load(); const timer = window.setInterval(load, 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, [lang]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, busy]);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError(t('ยกเลิกคำตอบแล้ว', 'Response cancelled.'));
  };

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy || stopping) return;
    const history = turns.filter((turn) => turn.content.trim()).slice(-7)
      .map(({ role, content }) => ({ role, content }));
    const messages: KioskChatMessage[] = [...history, { role: 'user', content: question }];
    setTurns((current) => [...current, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    try {
      for await (const update of kioskChat(messages, lang, request.signal)) {
        if (!alive.current || request.signal.aborted) break;
        if (update.type === 'delta') {
          setTurns((current) => current.map((turn, index) => index === current.length - 1
            ? { ...turn, content: turn.content + update.text } : turn));
        } else if (update.type === 'done') {
          if (update.sources?.length) setTurns((current) => current.map((turn, index) => index === current.length - 1
            ? { ...turn, sources: update.sources } : turn));
          if (update.job) { onJob(update.job); return; }
        }
      }
    } catch (cause) {
      if (alive.current && !request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : t('ตอบคำถามไม่สำเร็จ', 'Could not answer.'));
      }
    } finally {
      if (controller.current === request) controller.current = null;
      if (alive.current) setBusy(false);
    }
  };

  const close = () => { controller.current?.abort(); onClose(); };

  const stopRobot = async () => {
    controller.current?.abort(); controller.current = null; setBusy(false); setStopping(true); setError(null);
    try {
      await kioskCancel();
      if (alive.current) setTurns(current => [...current, { role: 'assistant', content: t('หยุดงานและยกเลิกคำสั่งที่รอแล้ว', 'Navigation and pending commands stopped.') }]);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'หยุดไม่สำเร็จ'); }
    finally { if (alive.current) setStopping(false); }
  };

  return <div className="flex-1 min-h-0 flex flex-col" style={{ gap: u(2) }}>
    <div className="flex items-center justify-between shrink-0" style={{ gap: u(2) }}>
      <button type="button" onClick={close} className="text-ink-2 bg-surface border border-line rounded active:bg-surface-3"
        style={{ padding: `${u(1.2)} ${u(3)}`, fontSize: u(2.5) }}>← {t('กลับ', 'Back')}</button>
      <span className="font-display font-bold text-navy" style={{ fontSize: u(2.5) }}>{t('คุยกับผู้ช่วย AI', 'AI assistant')}</span>
      <button type="button" onClick={() => { if (busy) cancel(); setTurns([]); setError(null); }}
        className="text-ink-2 bg-surface border border-line rounded active:bg-surface-3"
        style={{ padding: `${u(1.2)} ${u(2)}`, fontSize: u(2.2) }}>{t('เริ่มใหม่', 'New chat')}</button>
    </div>

    <div className="border border-line bg-surface-2 text-ink-2 shrink-0" style={{ padding: `${u(1.3)} ${u(2)}`, fontSize: u(1.9) }}>
      <strong className={status?.simulated === false ? 'text-navy' : 'text-amber'}>{status?.mockConnected ? t('MOCK TEST · หุ่นจำลอง', 'MOCK TEST · NO REAL ROBOT') : status?.simulated === false ? t('เชื่อมกับหุ่นจริง', 'LIVE ROBOT') : t('โหมดทดลอง', 'DEMO MODE')}</strong>{' · '}
      {status?.textReady
        ? status.simulated ? t('คุยด้วยข้อความได้ หุ่นเป็นแบบจำลอง', 'Text chat is ready. Robot actions are simulated.') : t('พิมพ์คำสั่งไป POI แล้วกดส่งเพื่อเริ่มนำทาง', 'Send a POI command to start navigation.')
        : t('กำลังตรวจสถานะ AI', 'Checking AI status')}
      {' · '}{status?.webReady ? t('ค้นเว็บพร้อม', 'Web search ready') : t('ยังไม่ได้เปิดค้นเว็บ', 'Web search not configured')}
    </div>

    <div className="flex flex-wrap shrink-0" style={{ gap: u(0.8) }}>
      {destinations.map(poi => <button key={poi.code} type="button" disabled={busy || stopping} onClick={() => setInput(lang === 'th' ? `เดินไปที่${poi.nameTh}` : `Go to ${poi.nameEn}`)}
        className="border border-line bg-surface rounded text-navy disabled:opacity-50" style={{ padding: `${u(0.7)} ${u(1.2)}`, fontSize: u(1.9) }}>{lang === 'th' ? poi.nameTh : poi.nameEn}</button>)}
      <button type="button" disabled={busy || stopping} onClick={() => setInput(t('กลับจุดชาร์จ', 'Return to charging station'))}
        className="border border-line bg-surface rounded text-navy disabled:opacity-50" style={{ padding: `${u(0.7)} ${u(1.2)}`, fontSize: u(1.9) }}>{t('กลับจุดชาร์จ', 'Return to charger')}</button>
      <button type="button" disabled={stopping} onClick={() => void stopRobot()}
        className="border border-red bg-red-bg rounded text-red disabled:opacity-50" style={{ padding: `${u(0.7)} ${u(1.2)}`, fontSize: u(1.9) }}>{stopping ? t('กำลังหยุด…', 'Stopping…') : t('หยุดหุ่น / ยกเลิกคำสั่ง', 'Stop / cancel command')}</button>
    </div>

    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col" style={{ gap: u(2), padding: `${u(1)} 0` }} aria-live="polite">
      {turns.length === 0 && <div className="flex-1 flex flex-col items-center justify-center text-center text-ink-2" style={{ gap: u(1.5) }}>
        <div className="bg-navy text-white rounded-full grid place-items-center font-display font-bold" style={{ width: u(10), height: u(10), fontSize: u(4) }}>AI</div>
        <h1 className="font-display font-bold text-ink m-0" style={{ fontSize: u(4) }}>{t('อยากรู้อะไร ถามได้เลย', 'What would you like to know?')}</h1>
        <p className="m-0" style={{ fontSize: u(2.3) }}>{t('ถามทั่วไป ถามเรื่องอาคาร หรือขอให้พาไปห้อง', 'Ask anything, ask about the building, or request directions.')}</p>
      </div>}
      {turns.map((turn, index) => <div key={index} className={`max-w-[92%] border rounded ${turn.role === 'user'
        ? 'self-end bg-navy text-white border-navy' : 'self-start bg-surface text-ink border-line'}`}
        style={{ padding: `${u(1.5)} ${u(2)}`, fontSize: u(2.35), lineHeight: 1.45 }}>
        <div className="whitespace-pre-wrap">{turn.content || (busy && index === turns.length - 1 ? t('กำลังคิด…', 'Thinking…') : '')}</div>
        {turn.sources?.length ? <div className="border-t border-line mt-2 pt-2 flex flex-col" style={{ gap: u(0.7), fontSize: u(1.8) }}>
          <strong>{t('แหล่งข้อมูลที่ค้นพบ', 'Sources found')}</strong>
          {turn.sources.map((source, sourceIndex) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"
            className="text-navy underline break-all">[{sourceIndex + 1}] {source.title}</a>)}
          <span className="text-ink-3">{t('ค้นเมื่อ', 'Retrieved')}: {new Date(turn.sources[0].retrievedAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}</span>
        </div> : null}
      </div>)}
      <div ref={bottom} />
    </div>

    {error && <p role="alert" className="text-red m-0" style={{ fontSize: u(2.1) }}>{error}</p>}
    {busy && <button type="button" onClick={cancel} className="border border-line-2 bg-surface text-navy rounded self-center"
      style={{ padding: `${u(1)} ${u(2)}`, fontSize: u(2.1) }}>{t('ยกเลิกคำตอบ', 'Cancel response')}</button>}
    <form onSubmit={(event) => void send(event)} className="flex shrink-0" style={{ gap: u(1) }}>
      <input value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} disabled={busy || stopping || !status?.textReady}
        className="min-w-0 flex-1 border border-line-2 rounded bg-white text-ink focus:outline-none focus:border-navy"
        style={{ padding: `${u(1.5)} ${u(1.8)}`, fontSize: u(2.35) }}
        aria-label={t('พิมพ์ข้อความ', 'Type a message')} placeholder={t('พิมพ์คำถามหรือคำขอ…', 'Type your question…')} />
      <button type="submit" disabled={busy || stopping || !input.trim() || !status?.textReady}
        className="bg-navy text-white font-bold rounded disabled:opacity-50 active:bg-navy-2"
        style={{ padding: `0 ${u(2.5)}`, fontSize: u(2.3) }}>{t('ส่ง', 'Send')}</button>
    </form>
    <p className="m-0 text-center text-ink-3 shrink-0" style={{ fontSize: u(1.7) }}>
      {t('เสียงยังไม่พร้อมใช้งาน · คำตอบ AI อาจผิดพลาดได้', 'Voice is not ready · AI answers may be inaccurate')}
    </p>
  </div>;
}
