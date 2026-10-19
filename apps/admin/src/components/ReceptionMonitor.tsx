'use client';
import { useEffect, useState } from 'react';
import type { ReceptionSession } from '@hermes/shared';
import { API_URL, api } from '../lib/api';

export function ReceptionMonitor() {
  const [sessions, setSessions] = useState<ReceptionSession[]>([]);
  const [selected, setSelected] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const update = (session: ReceptionSession) => setSessions(old => [session, ...old.filter(s => s.id !== session.id)].slice(0, 100));
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const connect = async () => {
      try {
        const response = await fetch(`${API_URL}/api/ai/reception/events`, { credentials: 'include', signal: controller.signal, cache: 'no-store' });
        if (!response.ok || !response.body) throw new Error(response.status === 403 ? 'เฉพาะ Admin และ Operator ที่ดูแชตผู้ใช้ได้' : 'เชื่อมต่อแชตสดไม่ได้');
        setConnected(true); setError('');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
              if (!block.startsWith('data: ')) continue;
              const event = JSON.parse(block.slice(6)) as { type: string; sessions?: ReceptionSession[]; session?: ReceptionSession };
              if (event.sessions) setSessions(event.sessions);
              if (event.session) update(event.session);
            }
          }
        } finally { reader.releaseLock(); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้'); }
      if (!controller.signal.aborted) { setConnected(false); timer = setTimeout(() => void connect(), 3000); }
    };
    void connect();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  const current = sessions.find(s => s.id === selected) ?? sessions[0];
  const act = async (path: string, body: unknown) => {
    if (!current || busy) return;
    setBusy(true); setError('');
    try { update(await api<ReceptionSession>(`/ai/reception/${current.id}/${path}`, { method: 'POST', body: JSON.stringify(body) })); if (path === 'messages') setInput(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  return <section className="border border-line rounded p-4 flex flex-col gap-3">
    <h2 className="font-bold">บทสนทนาผู้ใช้แบบสด · {connected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ'}</h2>
    {error && <p role="alert" className="text-red">{error}</p>}
    <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
      <div className="max-h-96 overflow-auto flex flex-col gap-2">
        {!sessions.length && <p className="text-sm">ยังไม่มีบทสนทนา เปิด Robot Interface → คุยกับผู้ช่วย เพื่อเริ่ม</p>}
        {sessions.map(s => <button className={`btn text-left ${current?.id === s.id ? 'bg-surface-3' : ''}`} key={s.id} onClick={() => setSelected(s.id)}>
          <span className="block">{s.mode === 'staff' ? 'เจ้าหน้าที่ดูแล' : 'AI ดูแล'} · {s.id.slice(0, 8)}</span>
          <span className="block text-xs truncate">{s.messages.at(-1)?.content.slice(0, 45) || 'บทสนทนาใหม่'}</span>
        </button>)}
      </div>
      {current && <div className="flex flex-col gap-3 min-w-0">
        <div className="flex gap-2 flex-wrap">
          <button className="btn" disabled={busy || current.mode === 'staff'} onClick={() => void act('mode', { mode: 'staff' })}>รับช่วงสนทนา</button>
          <button className="btn" disabled={busy || current.mode === 'ai'} onClick={() => void act('mode', { mode: 'ai' })}>คืนให้ AI</button>
          <span className="text-xs self-center">การรับช่วงจะยกเลิกคำตอบ AI ที่กำลังรอ แต่ไม่หยุดงานนำทางที่เริ่มไปแล้ว</span>
        </div>
        <div className="max-h-96 overflow-y-auto space-y-2" aria-live="polite">
          {current.messages.map(m => <div key={m.id} className={`p-3 rounded border border-line ${m.role === 'staff' ? 'bg-green-bg' : 'bg-surface-2'}`}>
            <strong className="text-xs">{m.role === 'user' ? 'ผู้ใช้' : m.role === 'staff' ? `เจ้าหน้าที่: ${m.author}` : 'AI'} · {new Date(m.at).toLocaleTimeString('th-TH')} · {m.status}</strong>
            <p className="whitespace-pre-wrap break-words">{m.content || 'กำลังตอบ…'}</p>
          </div>)}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void act('messages', { content: input }); }}>
          <input className="input flex-1 min-w-0" aria-label="ข้อความถึงผู้ใช้ผ่านหุ่น" placeholder="พิมพ์ข้อความถึงผู้ใช้" disabled={current.mode !== 'staff' || busy} maxLength={1200} value={input} onChange={e => setInput(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || current.mode !== 'staff' || !input.trim()}>ส่งผ่านหุ่น</button>
        </form>
      </div>}
    </div>
  </section>;
}
