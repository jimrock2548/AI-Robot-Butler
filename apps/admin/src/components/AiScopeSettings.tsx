'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useMe } from '../lib/useMe';

type Settings = { navigationOnly: boolean };
export function AiScopeSettings({ modelReady }: { modelReady: boolean | null }) {
  const me = useMe();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const saving = useRef(false), generation = useRef(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (saving.current) return;
      const started = generation.current;
      try {
        const next = await api<Settings>('/ai/settings');
        if (live && started === generation.current) { setSettings(next); setError(''); }
      } catch (e) { if (live && started === generation.current) setError(e instanceof Error ? e.message : 'อ่านการตั้งค่า AI ไม่สำเร็จ'); }
    };
    void load(); const timer = window.setInterval(() => void load(), 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  const change = async (navigationOnly: boolean) => {
    if (saving.current || !settings || me?.role !== 'admin') return;
    saving.current = true; generation.current++; setBusy(true); setMessage(''); setError('');
    try {
      const next = await api<Settings>('/ai/settings', { method: 'PUT', body: JSON.stringify({ navigationOnly }) });
      setSettings(next); setMessage(next.navigationOnly ? 'บันทึกแล้ว · จำกัดเฉพาะบริการนำทาง' : 'บันทึกแล้ว · เปิดสนทนาทั่วไปและค้นเว็บ');
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกการตั้งค่า AI ไม่สำเร็จ'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="border border-line rounded bg-surface p-4 space-y-3" aria-labelledby="ai-scope-title">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div><h2 id="ai-scope-title" className="font-semibold text-ink">ขอบเขตการทำงานของ AI</h2><p className="text-sm text-ink-2 mt-1">เลือกว่าจะให้ AI ตอบเฉพาะงานนำทาง หรือเปิดให้สนทนาทั่วไปและค้นอินเทอร์เน็ตด้วย</p></div>
      <span className="text-sm text-navy font-semibold" role="status">{!settings ? 'กำลังอ่านค่า…' : settings.navigationOnly ? 'เฉพาะบริการนำทาง' : 'สนทนาทั่วไปและค้นเว็บ'}</span>
    </div>
    <label className="flex items-center gap-3 cursor-pointer border border-line rounded p-3">
      <input type="checkbox" role="switch" aria-label="จำกัด AI เฉพาะบริการนำทาง" className="h-5 w-5 accent-blue-900" checked={settings?.navigationOnly ?? true} disabled={!settings || busy || me?.role !== 'admin'} onChange={e => void change(e.target.checked)} />
      <span><strong className="text-sm">จำกัด AI เฉพาะบริการนำทาง</strong><span className="block text-xs text-ink-2 mt-1">{busy ? 'กำลังบันทึก…' : 'เปิด: นำทาง / จุดหมาย / สถานะหุ่น · ปิด: เพิ่มคำถามทั่วไปและการค้นเว็บ'}</span></span>
    </label>
    <p className="text-xs text-ink-2">มีผลกับข้อความถัดไปบน Robot Interface โดยไม่ต้องรีสตาร์ต ระบบบันทึกค่าไว้ใช้ครั้งต่อไป การนำทางยังตรวจจุดหมายและสถานะหุ่นตามเดิม</p>
    {me && me.role !== 'admin' && <p className="text-xs text-amber">ผู้ดูแลระบบเท่านั้นที่เปลี่ยนค่านี้ได้</p>}
    {settings?.navigationOnly === false && modelReady === false && <p className="text-sm text-amber">เปิดโหมดสนทนาแล้ว แต่โมเดล Local ยังไม่พร้อม กรุณาเปิดบริการ AI ก่อนถามคำถามทั่วไป</p>}
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    {message && <p role="status" className="text-sm text-green">{message}</p>}
  </section>;
}
