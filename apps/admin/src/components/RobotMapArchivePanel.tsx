'use client';
import { useEffect, useState } from 'react';
import type { RobotMapArchive } from '@hermes/shared';
import { api, API_URL } from '../lib/api';
import { useRobot } from '../lib/RobotContext';
import type { ControlSettings } from './RobotSettings';

export function RobotMapArchivePanel() {
  const { state } = useRobot();
  const [maps, setMaps] = useState<RobotMapArchive[]>([]), [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState('แผนที่ห้องแลป'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const load = async () => {
    setMaps(await api<RobotMapArchive[]>('/robot/map-archives'));
    try { const s = await api<ControlSettings>('/robot/settings'); setActive(s.binding?.archiveId ?? null); } catch { /* Saved files remain available while offline. */ }
  };
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, []);
  const idle = state?.linkStatus === 'ok' && state.commandsEnabled && state.mode === 'idle' && !state.currentJob && !state.lock.mode;
  const act = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage('กำลังดำเนินการ กรุณารอสักครู่…');
    try { await work(); await load(); setMessage(success); } catch (e) { setMessage(e instanceof Error ? e.message : 'ดำเนินการไม่สำเร็จ'); } finally { setBusy(false); }
  };
  const download = async (map: RobotMapArchive) => {
    const r = await fetch(`${API_URL}/api/robot/map-archives/${map.id}/download`, { credentials: 'include' });
    if (!r.ok) throw new Error('ดาวน์โหลดแผนที่ไม่สำเร็จ');
    const url = URL.createObjectURL(await r.blob()); const a = document.createElement('a'); a.href = url; a.download = `${map.name}.stcm`; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="border border-line rounded p-4 space-y-3">
    <h2 className="font-semibold">แผนที่ SLAM บนหุ่น · ไฟล์ STCM</h2>
    <p className="text-sm">บันทึกแผนที่จากหุ่นหลายสถานที่ อัปโหลดไฟล์ และเลือกโหลดกลับหุ่นได้ แยกจากแผนผัง JSON ด้านล่าง</p>
    <label className="block">ชื่อแผนที่<input className="input ml-2" aria-label="ชื่อแผนที่ STCM" value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
    <div className="flex gap-2 flex-wrap">
      <button className="btn btn-primary" disabled={!idle || busy || !name.trim()} onClick={() => void act(() => api('/robot/map-archives/capture', { method: 'POST', body: JSON.stringify({ name }) }), 'บันทึกไฟล์แผนที่จากหุ่นลงฐานข้อมูลแล้ว')}>บันทึกแผนที่ปัจจุบัน</button>
      <label className="btn">อัปโหลด .stcm<input aria-label="อัปโหลด STCM" className="max-w-52" type="file" accept=".stcm" disabled={busy || !name.trim()} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        if (file.size > 20000000) { setMessage('ไฟล์ต้องไม่เกิน 20 MB'); return; }
        void act(async () => {
          const r = await fetch(`${API_URL}/api/robot/map-archives/upload?name=${encodeURIComponent(name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
          if (!r.ok) { const error = await r.json().catch(() => null); throw new Error(error?.error?.message ?? 'อัปโหลดไม่สำเร็จ'); }
        }, 'อัปโหลดลงคลังแล้ว เลือกโหลดบนหุ่นเมื่อต้องการ');
      }} /></label>
      <button className="btn" disabled={busy} onClick={() => void act(load, 'อัปเดตรายการแล้ว')}>รีเฟรชรายการ</button>
    </div>
    <p className="text-sm text-amber">การโหลดแผนที่จะสำรองของเดิมและรีเซ็ตตำแหน่งหุ่น ต้องระบุตำแหน่ง/ทิศใหม่ที่หน้าแผนที่ก่อนนำทาง ไฟล์ในคลังเก็บถาวรในฐานข้อมูล ส่วนแผนที่ที่โหลดบนหุ่นอาจต้องโหลดใหม่หลังรีสตาร์ตหุ่น</p>
    <div className="grid gap-2 lg:grid-cols-2">{maps.map(map => <article key={map.id} className="border border-line rounded p-3 space-y-2">
      <strong>{map.name}{active === map.id ? ' · โหลดล่าสุด' : ''}</strong>
      <p className="text-xs">{(map.byteLength / 1024).toFixed(1)} KB · {new Date(map.createdAt).toLocaleString('th-TH')} · {map.source === 'backup' ? 'สำรองอัตโนมัติ' : map.source === 'robot' ? 'บันทึกจากหุ่น' : 'อัปโหลด'}</p>
      <div className="flex gap-2"><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => download(map), 'ดาวน์โหลดไฟล์แล้ว')}>ดาวน์โหลด STCM</button>
        <button className="btn btn-sm" disabled={busy || !idle} onClick={() => {
          if (window.confirm(`โหลด “${map.name}” บนหุ่นจริง? ระบบจะสำรองแผนที่ปัจจุบันและปิดโหมดสร้างแผนที่ให้ ตำแหน่งจะถูกรีเซ็ตและต้องระบุตำแหน่งใหม่`)) void act(() => api(`/robot/map-archives/${map.id}/activate`, { method: 'POST', body: '{}' }), 'โหลดแผนที่แล้ว ไปหน้าแผนที่ → ระบุตำแหน่งหุ่น ก่อนนำทาง');
        }}>โหลดบนหุ่น</button></div>
    </article>)}</div>
    {!maps.length && <p>ยังไม่มีไฟล์แผนที่ในคลัง</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
