'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useRobot } from '../lib/RobotContext';
import { useMe } from '../lib/useMe';

export interface ControlSettings {
  desired: { linearMps: number; angularRps: number };
  actual: { linearMps: number; angularRps: number };
  bounds: { minLinearMps: number; maxLinearMps: number; minAngularRps: number; maxAngularRps: number };
  binding: { archiveId: string | null; needsLocalization: boolean; dockNeedsVerification?: boolean } | null;
  standby: { poiId: string | null; returnPolicy: 'manual' | 'after_job' } | null;
}
export function RobotSettings() {
  const { state, liveMap, mapError } = useRobot(); const me = useMe();
  const [settings, setSettings] = useState<ControlSettings | null>(null);
  const [linear, setLinear] = useState(0.1), [angular, setAngular] = useState(0.3);
  const [poiId, setPoiId] = useState(''), [automatic, setAutomatic] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const load = async (draft = false) => {
    const value = await api<ControlSettings>('/robot/settings'); setSettings(value);
    if (draft) { setLinear(value.desired.linearMps); setAngular(value.desired.angularRps); setPoiId(value.standby?.poiId ?? ''); setAutomatic(value.standby?.returnPolicy === 'after_job'); }
  };
  useEffect(() => { void load(true).catch(e => setMessage(e.message)); const tick = setInterval(() => { void load().catch(() => {}); }, 10000); return () => clearInterval(tick); }, []);
  const canEdit = !!state?.commandsEnabled && (me?.role === 'admin' || me?.role === 'operator') && state.linkStatus === 'ok'
    && state.mode === 'idle' && !state.currentJob && !state.lock.mode && !busy;
  const navigationReady = !!liveMap && !mapError && liveMap.mappingEnabled === false && (liveMap.localizationQuality ?? 0) >= 50
    && Date.now() - Date.parse(liveMap.capturedAt) <= 5000 && !settings?.binding?.needsLocalization;
  const act = async (path: string, method: string, body: object, success: string) => {
    setBusy(true); setMessage('');
    try { await api(path, { method, body: JSON.stringify(body) }); await load(); setMessage(success); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'ตั้งค่าไม่สำเร็จ'); } finally { setBusy(false); }
  };
  return <section className="bg-surface border border-line rounded p-5 space-y-4" aria-label="ความเร็วและจุดประจำ">
    <h2 className="font-semibold">ความเร็วของหุ่น</h2>
    <p className="text-sm">ค่าที่อ่านจากหุ่น: เดิน {settings?.actual.linearMps.toFixed(2) ?? '—'} m/s · หมุน {settings?.actual.angularRps.toFixed(2) ?? '—'} rad/s</p>
    <label className="block">ความเร็วเดิน: {linear.toFixed(2)} m/s
      <input className="w-full" aria-label="ความเร็วเดิน" type="range" min={settings?.bounds.minLinearMps ?? 0.05} max={settings?.bounds.maxLinearMps ?? 0.5} step="0.05" value={linear} disabled={!canEdit || !settings} onChange={e => setLinear(Number(e.target.value))} />
    </label>
    <label className="block">ความเร็วหมุน: {angular.toFixed(2)} rad/s
      <input className="w-full" aria-label="ความเร็วหมุน" type="range" min={settings?.bounds.minAngularRps ?? 0.1} max={settings?.bounds.maxAngularRps ?? 1} step="0.05" value={angular} disabled={!canEdit || !settings} onChange={e => setAngular(Number(e.target.value))} />
    </label>
    <div className="flex gap-2 flex-wrap">{[0.1, 0.2, 0.3, 0.5].map(v => <button key={v} className="btn btn-sm" disabled={!canEdit || !settings} onClick={() => setLinear(v)}>{v.toFixed(2)} m/s</button>)}</div>
    <button className="btn btn-primary" disabled={!canEdit || !settings} onClick={() => void act('/robot/speed', 'PUT', { linearMps: linear, angularRps: angular }, 'บันทึกความเร็วและอ่านกลับจากหุ่นแล้ว')}>บันทึกความเร็ว</button>
    <p className="text-xs text-ink-3">เป็นเพดานความเร็ว ไม่ใช่ความเร็วที่หุ่นต้องวิ่งตลอดเวลา หุ่นอาจชะลอตามสิ่งกีดขวาง ปรับได้ขณะหุ่นว่างและปล่อย lock แล้ว</p>
    <hr className="border-line" /><h2 className="font-semibold">จุดประจำตำแหน่ง</h2>
    <select className="input w-full" aria-label="จุดประจำตำแหน่ง" value={poiId} disabled={!canEdit} onChange={e => setPoiId(e.target.value)}>
      <option value="">ยังไม่กำหนด</option>{liveMap?.pois?.map(p => <option key={p.id} value={p.id}>{String(p.metadata?.display_name ?? p.id)}</option>)}
    </select>
    <label className="flex gap-2"><input type="checkbox" checked={automatic} disabled={!canEdit || !poiId} onChange={e => setAutomatic(e.target.checked)} />กลับจุดประจำอัตโนมัติหลังนำทางถึงจุดหมาย</label>
    <div className="flex gap-2 flex-wrap">
      <button className="btn" disabled={!canEdit || !liveMap || liveMap.mappingEnabled !== false} onClick={() => {
        if (automatic && !window.confirm('เปิดกลับจุดประจำอัตโนมัติหลังนำทางถึงจุดหมาย? หุ่นจะเริ่มงานกลับเมื่อผ่านเงื่อนไขนำทาง')) return;
        void act('/robot/standby', 'PUT', { poiId: poiId || null, returnPolicy: automatic && poiId ? 'after_job' : 'manual' }, 'บันทึกจุดประจำบนแผนที่นี้แล้ว');
      }}>บันทึกจุดประจำ</button>
      <button className="btn" disabled={!canEdit || !navigationReady || !settings?.standby?.poiId} onClick={() => {
        if (window.confirm('สั่งหุ่นเดินกลับจุดประจำตอนนี้?')) void act('/robot/standby/return', 'POST', {}, 'ส่งงานกลับจุดประจำแล้ว');
      }}>กลับจุดประจำ</button>
    </div>
    <p className="text-xs text-ink-3">เมื่อเปิดกลับอัตโนมัติ จะรออย่างน้อย 5 วินาทีหลังถึงจุดหมายก่อนกลับ จุดประจำผูกกับแผนที่จริง หลังเปลี่ยนแผนที่ต้องตั้งใหม่ การหยุด ยกเลิก ควบคุมด้วยมือ หรือขาดการเชื่อมต่อระหว่างรอจะยกเลิกการกลับรอบนั้น</p>
    {settings?.binding?.needsLocalization && <p className="text-amber">ต้องระบุตำแหน่งหลังเปลี่ยนแผนที่ที่หน้าแผนที่ก่อนนำทาง</p>}
    {settings?.binding?.dockNeedsVerification && <div className="space-y-2 text-sm text-amber">
      <p>หลังล้างแผนที่ ต้องตั้งแท่นชาร์จสำหรับแผนที่ใหม่บนหุ่นและตรวจว่าตรงกับตำแหน่งจริงก่อนกลับแท่น</p>
      <p>ตำแหน่งที่หุ่นรายงาน: {liveMap?.home ? `x=${liveMap.home.x.toFixed(2)}, y=${liveMap.home.y.toFixed(2)}` : 'ยังไม่มีแท่นชาร์จ'}</p>
      <button className="btn" disabled={!canEdit || !navigationReady || !liveMap?.home} onClick={() => {
        if (window.confirm('ยืนยันว่าตำแหน่งแท่นชาร์จบนแผนที่ใหม่ตรงกับแท่นจริงแล้ว?')) void act('/robot/dock/verify', 'POST', { confirmation: 'CONFIRM DOCK' }, 'ยืนยันตำแหน่งแท่นชาร์จแล้ว');
      }}>ยืนยันตำแหน่งแท่นชาร์จใหม่</button>
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
