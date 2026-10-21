'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useRobot } from '../lib/RobotContext';
import { useMe } from '../lib/useMe';

type OperatingMode = 'normal' | 'exploration';

/** Explicit mode changes are verified against the robot; loading the page only reads. */
export function RobotOperatingMode({ connected, canSelect }: { connected: boolean; canSelect: boolean }) {
  const [mode, setMode] = useState<OperatingMode>('normal');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state, liveMap } = useRobot();
  const [busy, setBusy] = useState(false);
  const me = useMe();
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const idle = connected && !!state?.commandsEnabled && state.mode === 'idle' && !state.currentJob && !state.lock.mode;
  const canClear = idle && me?.role === 'admin' && !busy;
  const clear = async () => {
    if (!canClear || confirmation !== 'CLEAR MAP') return;
    setBusy(true); setError(null); setNotice('');
    try {
      const result = await api<{ backupId: string }>('/robot/map/clear', { method: 'POST', body: JSON.stringify({ confirmation }) });
      setMode('exploration'); setConfirmation('');
      setNotice(`ล้างแผนที่ POI และกำแพงเดิมแล้ว เปิดโหมดสร้างแผนที่ใหม่พร้อมใช้งาน · สำรอง STCM: ${result.backupId} (ดูได้ในคลังแผนที่)`);
    } catch (e) { setError(e instanceof Error ? e.message : 'ล้างแผนที่ไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (typeof liveMap?.mappingEnabled === 'boolean') { setMode(liveMap.mappingEnabled ? 'exploration' : 'normal'); setReady(true); }
  }, [liveMap?.mappingEnabled]);

  async function select(next: OperatingMode) {
    if (next === 'exploration' && !window.confirm('เปิดโหมดสร้างแผนที่บนหุ่น? ระบบจะสำรองแผนที่ก่อน โหมดนี้ยังไม่สั่งหุ่นเดิน')) return;
    setBusy(true); setError(null);
    try {
      const result = await api<{ mode: OperatingMode }>('/robot/operating-mode', { method: 'PUT', body: JSON.stringify({ mode: next }) });
      setMode(result.mode);
    } catch (e) { setError(e instanceof Error ? e.message : 'เปลี่ยนโหมดไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  return <section className="bg-surface border border-line rounded-[3px] p-5 space-y-3" aria-labelledby="operating-mode-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="operating-mode-heading" className="font-semibold">โหมดการใช้งานหุ่น</h2>
      <span className="text-sm text-ink-3">{connected ? 'เชื่อมต่อหุ่น · อ่านโหมดจากหุ่นจริง' : 'หุ่นออฟไลน์'}</span>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกโหมดการใช้งาน">
      {([{ value: 'normal', label: 'โหมดปกติ' }, { value: 'exploration', label: 'โหมดสำรวจ' }] as const).map(item =>
        <button key={item.value} type="button" aria-pressed={mode === item.value}
          disabled={!ready || !canSelect || !connected || !state?.commandsEnabled || !!state.currentJob || !!state.lock.mode || state.mode !== 'idle' || busy || mode === item.value} onClick={() => void select(item.value)}
          className={`rounded-lg border px-5 py-3 text-sm font-medium disabled:opacity-50 ${mode === item.value ? 'bg-blue-600 text-white border-blue-600' : 'border-current text-ink-3'}`}>
          {item.label}
        </button>)}
    </div>
    <p className="text-sm">{mode === 'normal' ? 'โหมดปกติ: ใช้แผนที่และ POI ที่บันทึกไว้สำหรับนำทาง' : 'โหมดสำรวจ: สำหรับเตรียมสำรวจพื้นที่และสร้างแผนที่'}</p>
    <p className="text-sm text-ink-3">กดเพื่อเปลี่ยนโหมดบนหุ่นและอ่านกลับยืนยัน โหมดสำรวจเปิดการอัปเดต SLAM ใช้การควบคุมด้วยมือเพื่อสำรวจ ปิดกลับโหมดปกติก่อนแก้ POI หรือนำทาง ต้องสิ้นสุดงานและปล่อย lock ก่อนเปลี่ยนโหมด</p>
    {!canSelect && <p className="text-sm text-ink-3">ผู้ควบคุมหรือผู้ดูแลระบบสามารถเลือกโหมดได้</p>}
    <details className="border border-line rounded p-3 space-y-3">
      <summary className="font-semibold cursor-pointer">เริ่มสร้างแผนที่ใหม่ / Clear map</summary>
      <p className="text-sm">ระบบจะสำรอง STCM ลงคลังก่อน ล้างแผนที่ SLAM พร้อม POI และกำแพงเสมือนเดิม ปิดการกลับจุดประจำอัตโนมัติ แล้วเปิดโหมดสร้างแผนที่ โดยหุ่นยังไม่เดินเอง</p>
      <p className="text-sm">เมื่อสร้างเสร็จให้บันทึกลงคลัง ปิดโหมดสำรวจ และระบุตำแหน่งหุ่นใหม่ ตรวจตำแหน่งแท่นชาร์จก่อนยืนยันการกลับแท่น</p>
      <label className="block text-sm">พิมพ์ CLEAR MAP เพื่อยืนยัน
        <input className="input ml-2" aria-label="ยืนยันล้างแผนที่" autoComplete="off" value={confirmation} disabled={!canClear} onChange={e => setConfirmation(e.target.value)} />
      </label>
      <button type="button" className="btn btn-error" disabled={!canClear || confirmation !== 'CLEAR MAP'} onClick={() => void clear()}>{busy ? 'กำลังดำเนินการ…' : 'ล้างแผนที่และเริ่มสร้างใหม่'}</button>
      {me?.role !== 'admin' ? <p className="text-sm text-ink-3">เฉพาะผู้ดูแลระบบที่ล้างแผนที่ได้</p> : !idle && <p className="text-sm text-amber">ต้องเชื่อมต่อหุ่น หุ่นว่าง ปล่อย lock และปลด E-Stop ก่อนล้างแผนที่</p>}
    </details>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
