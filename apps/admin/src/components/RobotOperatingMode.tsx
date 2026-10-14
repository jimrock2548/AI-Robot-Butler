'use client';

import { useEffect, useState } from 'react';

type OperatingMode = 'normal' | 'exploration';
const storageKey = 'hermes.operating-mode.preference.v1';

/** Offline preference only. Selecting or restoring a mode never sends robot commands. */
export function RobotOperatingMode({ connected, canSelect }: { connected: boolean; canSelect: boolean }) {
  const [mode, setMode] = useState<OperatingMode>('normal');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'normal' || saved === 'exploration') setMode(saved);
    } catch { setError('อ่านโหมดที่บันทึกไว้ไม่ได้'); }
    setReady(true);
  }, []);

  function select(next: OperatingMode) {
    setMode(next);
    try { localStorage.setItem(storageKey, next); setError(null); }
    catch { setError('บันทึกไม่ได้ โหมดนี้จะอยู่เฉพาะตอนเปิดหน้านี้'); }
  }

  return <section className="bg-surface border border-line rounded-[3px] p-5 space-y-3" aria-labelledby="operating-mode-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="operating-mode-heading" className="font-semibold">โหมดการใช้งานหุ่น</h2>
      <span className="text-sm text-ink-3">{connected ? 'เชื่อมต่อหุ่น' : 'หุ่นออฟไลน์'} · ตั้งค่าบนเว็บ</span>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกโหมดการใช้งาน">
      {([{ value: 'normal', label: 'โหมดปกติ' }, { value: 'exploration', label: 'โหมดสำรวจ' }] as const).map(item =>
        <button key={item.value} type="button" aria-pressed={mode === item.value}
          disabled={!ready || !canSelect} onClick={() => select(item.value)}
          className={`rounded-lg border px-5 py-3 text-sm font-medium disabled:opacity-50 ${mode === item.value ? 'bg-blue-600 text-white border-blue-600' : 'border-current text-ink-3'}`}>
          {item.label}
        </button>)}
    </div>
    <p className="text-sm">{mode === 'normal' ? 'โหมดปกติ: ใช้แผนที่และ POI ที่บันทึกไว้สำหรับนำทาง' : 'โหมดสำรวจ: สำหรับเตรียมสำรวจพื้นที่และสร้างแผนที่'}</p>
    <p className="text-sm text-ink-3">บันทึกตัวเลือกไว้ในเบราว์เซอร์นี้ ยังไม่ได้เปลี่ยนโหมดบนหุ่น การเชื่อมต่อใหม่จะไม่เริ่มสำรวจหรือสั่งเดินอัตโนมัติ</p>
    {!canSelect && <p className="text-sm text-ink-3">ผู้ควบคุมหรือผู้ดูแลระบบสามารถเลือกโหมดได้</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
