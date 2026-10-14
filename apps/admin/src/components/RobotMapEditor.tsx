'use client';

import { useState } from 'react';
import type { RobotPoi } from '@hermes/shared';
import { useRobot } from '../lib/RobotContext';
import { useMe, useNow } from '../lib/useMe';
import { api } from '../lib/api';
import { LiveRobotMap } from './LiveRobotMap';

export function RobotMapEditor() {
  const { state, liveMap: map, mapError } = useRobot();
  const me = useMe(), now = useNow();
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<RobotPoi | null>(null);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [heading, setHeading] = useState('0');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const allowed = state?.commandsEnabled && (me?.role === 'admin' || me?.role === 'operator');
  const capturedAt = map ? Date.parse(map.capturedAt) : NaN;
  const stale = !map || !!mapError || !Number.isFinite(capturedAt) || now - capturedAt > 5000;
  const idle = !state?.currentJob && !state?.lock.mode;
  const canEdit = !!allowed && !stale && idle && !busy && map?.mappingEnabled === false;
  const blockedReason = !state || !me ? 'รอข้อมูลสถานะหุ่นและบัญชีผู้ใช้'
    : !allowed ? !state.commandsEnabled ? 'ระบบอยู่ในโหมดอ่านอย่างเดียว จึงยังบันทึก POI ไม่ได้' : 'ต้องมีสิทธิ์ operator หรือ admin เพื่อแก้ POI'
    : !idle ? 'สิ้นสุดงานและปล่อยสิทธิ์ควบคุมก่อนแก้ POI'
    : stale ? mapError ?? 'รอข้อมูลแผนที่สด'
    : map?.mappingEnabled === true ? 'ปิดโหมดสร้างแผนที่บนหุ่นก่อนแก้ POI'
    : map?.mappingEnabled !== false ? 'อ่านโหมดแผนที่จากหุ่นไม่ได้ จึงยังบันทึก POI ไม่ได้'
    : null;
  const selectPoi = (poi: RobotPoi) => {
    setEditing(poi); setSelected(poi.pose ?? null);
    setName(typeof poi.metadata?.display_name === 'string' ? poi.metadata.display_name : '');
    setAliases(Array.isArray(poi.metadata?.aliases) ? poi.metadata.aliases.filter(item => typeof item === 'string').join(', ') : '');
    setHeading(String(Math.round((poi.pose?.yaw ?? 0) * 180 / Math.PI)));
    setMessage(null);
  };
  const fresh = () => { setEditing(null); setSelected(null); setName(''); setAliases(''); setHeading('0'); setMessage(null); };
  const save = async () => {
    if (!canEdit || !selected || !name.trim() || !Number.isFinite(Number(heading))) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/robot/pois${editing ? '/' + editing.id : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ name: name.trim(), aliases: aliases.split(/[,\n]/).map(item => item.trim()).filter(Boolean), ...selected, headingDeg: Number(heading) }) });
      fresh(); setMessage('บันทึก POI บนหุ่นและอ่านกลับยืนยันแล้ว');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!canEdit || !editing || !window.confirm(`ลบจุด “${name || editing.id}” ออกจากหุ่น?`)) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/robot/pois/${editing.id}`, { method: 'DELETE' });
      fresh(); setMessage('ลบ POI และอ่านกลับยืนยันแล้ว');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ลบไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
    <LiveRobotMap selected={selected} selectionRequest={selectionRequest} onSelect={canEdit ? point => { setSelected(point); setMessage(null); } : undefined} onPoiSelect={selectPoi} />
    <aside className="flex flex-col gap-3 border border-line rounded p-3 self-start">
      <h2 className="font-semibold">จุด POI บนหุ่น</h2>
      <p className="text-xs text-ink-3">เลือกจุดบนแผนที่เพื่อเพิ่ม หรือคลิกจุดสีม่วงเพื่อแก้ไข การบันทึกจุดไม่สั่งหุ่นเดิน</p>
      <button type="button" className="btn btn-sm" disabled={!canEdit} onClick={() => { fresh(); setSelectionRequest(value => value + 1); }}>＋ จุดใหม่</button>
      <label className="text-sm">ชื่อจุด<input className="input w-full" value={name} maxLength={80} disabled={!canEdit} onChange={event => setName(event.target.value)} /></label>
      <label className="text-sm">ชื่อเรียกอื่น (คั่นด้วย ,)<input className="input w-full" value={aliases} maxLength={1600} disabled={!canEdit} onChange={event => setAliases(event.target.value)} placeholder="ทางเข้า, ประตูทางเข้า, entrance" /></label>
      <p className="text-xs font-mono">{selected ? `x=${selected.x.toFixed(2)} · y=${selected.y.toFixed(2)} m` : 'เลือกตำแหน่งบนแผนที่'}</p>
      <label className="text-sm">ทิศหันเมื่อถึงจุด (องศา)<input className="input w-full" type="number" min={-360} max={360} value={heading} disabled={!canEdit} onChange={event => setHeading(event.target.value)} /></label>
      <p className="text-xs text-ink-3">0° = ขวาบนแผนที่ · 90° = ขึ้น</p>
      <button type="button" className="btn btn-primary" disabled={!canEdit || !selected || !name.trim() || heading.trim() === '' || !Number.isFinite(Number(heading)) || Math.abs(Number(heading)) > 360} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'เพิ่ม POI บนหุ่น'}</button>
      {editing && <button type="button" className="btn btn-error" disabled={!canEdit} onClick={() => void remove()}>ลบจุดนี้</button>}
      {blockedReason ? <p role="status" className="text-xs text-amber">{blockedReason}</p>
        : !busy && !selected ? <p className="text-xs text-ink-3">คลิก “จุดใหม่” แล้วคลิกตำแหน่งบนแผนที่ กรอกชื่อและกด “เพิ่ม POI บนหุ่น”</p> : null}
      {message && <p role="status" className="text-sm">{message}</p>}
      <div className="max-h-64 overflow-auto flex flex-col gap-1">
        {map?.pois === null && <p className="text-xs text-amber">อ่านรายการ POI จากหุ่นไม่ได้</p>}
        {map?.pois?.length === 0 && <p className="text-xs text-ink-3">ยังไม่มี POI บนหุ่น</p>}
        {map?.pois?.map(poi => <button key={poi.id} type="button" className={`text-left text-sm border p-2 rounded ${editing?.id === poi.id ? 'border-navy bg-surface-3' : 'border-line'}`} disabled={busy} onClick={() => selectPoi(poi)}>{typeof poi.metadata?.display_name === 'string' ? poi.metadata.display_name : poi.id}</button>)}
      </div>
    </aside>
  </div>;
}
