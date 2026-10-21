'use client';
import { useState } from 'react';
import type { RobotWall } from '@hermes/shared';
import { api } from '../lib/api';
import { useRobot } from '../lib/RobotContext';
import { useMe, useNow } from '../lib/useMe';
import { RobotMapEditor } from './RobotMapEditor';
import { LiveRobotMap } from './LiveRobotMap';

type Point = { x: number; y: number };
export function RobotMapWorkspace() {
  const [tool, setTool] = useState<'poi' | 'walls' | 'pose'>('poi');
  const [start, setStart] = useState<Point | null>(null), [end, setEnd] = useState<Point | null>(null);
  const [editing, setEditing] = useState<number | null>(null), [heading, setHeading] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const { state, liveMap: map, mapError } = useRobot(); const me = useMe(), now = useNow();
  const canEdit = !!state?.commandsEnabled && state.linkStatus === 'ok' && state.mode === 'idle' && !state.currentJob && !state.lock.mode
    && (me?.role === 'admin' || me?.role === 'operator') && !!map && map.mappingEnabled === false && !mapError
    && now - Date.parse(map.capturedAt) < 5000 && !busy;
  const changeTool = (next: typeof tool) => { setTool(next); setStart(null); setEnd(null); setEditing(null); setMessage(''); };
  const act = async (path: string, method: string, data?: object) => {
    setBusy(true); setMessage('');
    try { await api(path, { method, ...(data ? { body: JSON.stringify(data) } : {}) }); setMessage(tool === 'pose' ? 'ระบุตำแหน่งและอ่านกลับแล้ว รอคุณภาพอย่างน้อย 50 ก่อนนำทาง' : 'บันทึกบนหุ่นและอ่านกลับยืนยันแล้ว'); setStart(null); setEnd(null); setEditing(null); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'คำสั่งไม่สำเร็จ'); } finally { setBusy(false); }
  };
  const select = (p: Point) => { if (tool === 'pose' || !start || end) { setStart(p); setEnd(null); } else setEnd(p); };
  const pickWall = (w: RobotWall) => { setEditing(w.id); setStart(w.start); setEnd(w.end); };
  return <div className="space-y-3">
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="เครื่องมือจัดการแผนที่">
      {([{ id: 'poi', label: 'จุด POI' }, { id: 'walls', label: 'กำแพงเสมือน' }, { id: 'pose', label: 'ระบุตำแหน่งหุ่น' }] as const).map(t => <button className="btn" role="tab" aria-selected={tool === t.id} key={t.id} onClick={() => changeTool(t.id)}>{t.label}</button>)}
    </div>
    {tool === 'poi' ? <RobotMapEditor /> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <LiveRobotMap selected={start} onSelect={canEdit ? select : undefined} draftWall={tool === 'walls' && start && end ? { start, end } : null} />
      <aside className="space-y-3 border border-line p-3 rounded self-start">
        <h2 className="font-semibold">{tool === 'walls' ? 'กำแพงเสมือนบนหุ่น' : 'ระบุตำแหน่งหุ่นบนแผนที่'}</h2>
        <p className="text-sm">{tool === 'walls' ? 'คลิกจุดเริ่มและจุดสิ้นสุดบนแผนที่ เส้นประสีฟ้าคือร่าง กดบันทึกจึงส่งไปหุ่น' : 'เลือกตำแหน่งจริงที่หุ่นยืนอยู่ แล้วกำหนดทิศหัน การตั้งค่านี้ไม่ทำให้หุ่นเดิน'}</p>
        <p className="text-xs">{start ? `จุดแรก x=${start.x.toFixed(2)}, y=${start.y.toFixed(2)}` : 'ยังไม่เลือกจุด'}{end && ` · จุดปลาย x=${end.x.toFixed(2)}, y=${end.y.toFixed(2)}`}</p>
        {tool === 'pose' && <label className="block">ทิศหัน (0° ขวา / 90° ขึ้น)<input className="input w-full" aria-label="ทิศหุ่นจริง" type="number" min="-360" max="360" value={heading} onChange={e => setHeading(Number(e.target.value))} /></label>}
        <button className="btn btn-primary" disabled={!canEdit || !start || (tool === 'walls' && (!end || Math.hypot(start.x - end.x, start.y - end.y) < 0.05)) || !Number.isFinite(heading) || Math.abs(heading) > 360} onClick={() => {
          if (!start) return;
          if (tool === 'pose') { if (window.confirm('ยืนยันว่าตำแหน่งและทิศที่เลือกตรงกับหุ่นจริง?')) void act('/robot/localization', 'PUT', { ...start, headingDeg: heading }); }
          else if (end) void act(`/robot/walls${editing === null ? '' : '/' + editing}`, editing === null ? 'POST' : 'PUT', { start, end });
        }}>{tool === 'pose' ? 'ยืนยันตำแหน่งหุ่น' : editing === null ? 'เพิ่มกำแพงบนหุ่น' : 'บันทึกแก้ไขกำแพง'}</button>
        <button className="btn" disabled={busy} onClick={() => { setStart(null); setEnd(null); setEditing(null); }}>ล้างจุดที่เลือก</button>
        {tool === 'walls' && <div className="space-y-2 max-h-96 overflow-auto">
          {map?.walls === null && <p>อ่านกำแพงจากหุ่นไม่ได้</p>}
          {map?.walls?.map(w => <div key={w.id} className="border border-line p-2 rounded flex gap-2"><button className="btn btn-sm" disabled={!canEdit} onClick={() => pickWall(w)}>กำแพง #{w.id}</button><button className="btn btn-sm" disabled={!canEdit} onClick={() => { if (window.confirm(`ลบกำแพง #${w.id} บนหุ่น?`)) void act('/robot/walls/' + w.id, 'DELETE'); }}>ลบ</button></div>)}
        </div>}
        {!canEdit && <p className="text-sm text-amber">ต้องมีแผนที่สด อยู่โหมดปกติ และสิ้นสุดงาน/ปล่อย lock ก่อนแก้ไข</p>}
        {message && <p role="status">{message}</p>}
      </aside>
    </div>}
  </div>;
}
