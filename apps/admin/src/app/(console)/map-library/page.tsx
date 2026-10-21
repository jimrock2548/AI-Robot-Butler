'use client';
import { useEffect, useState } from 'react';
import type { LibraryMap } from '@hermes/shared';
import { api } from '../../../lib/api';
import { RobotMapArchivePanel } from '../../../components/RobotMapArchivePanel';

const template = { name: 'ห้องแลป', widthM: 12, heightM: 8,
  pois: [{ code: 'WELCOME', name: 'จุดต้อนรับ', x: 2, y: 2, headingDeg: 90 },
    { code: 'ROOM1', name: 'ห้องประชุม', x: 8, y: 5, headingDeg: 0 }],
  standbyCode: 'WELCOME', returnPolicy: 'manual' };
export default function MapLibraryPage() {
  const [maps, setMaps] = useState<LibraryMap[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [input, setInput] = useState(JSON.stringify(template, null, 2));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const load = async () => {
    const data = await api<{ maps: LibraryMap[]; selection: { id: string } | null }>('/map-library');
    setMaps(data.maps); setSelected(data.selection?.id ?? null);
  };
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/map-library${editing ? '/' + editing : ''}`, { method: editing ? 'PUT' : 'POST', body: input });
      await load(); setNotice('บันทึกแผนที่และจุดประจำในคลังแล้ว');
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  const exportMap = (map: LibraryMap) => {
    const { id: _id, updatedAt: _time, ...data } = map;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `map-${map.id}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const current = maps.find(m => m.id === selected);
  return <div className="flex flex-col gap-4">
    <h1 className="text-xl font-bold">คลังแผนที่และจุดประจำ</h1>
    <RobotMapArchivePanel />
    <p className="text-sm text-amber">ส่วนแผนผัง JSON ด้านล่างใช้เลือกดูและเตรียมข้อมูล หากต้องการบันทึกหรือโหลดแผนที่จริงให้ใช้ส่วนไฟล์ STCM ด้านบน</p>
    {error && <p role="alert" className="text-red">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-3">
        <button className="btn" onClick={() => { setEditing(null); setInput(JSON.stringify(template, null, 2)); }}>＋ แผนที่ใหม่</button>
        {maps.map(map => <div key={map.id} className="border border-line rounded p-3 flex flex-col gap-2">
          <strong>{map.name}{selected === map.id ? ' · เลือกแสดงอยู่' : ''}</strong>
          <span>{map.pois.length} POI · จุดประจำ: {map.pois.find(p => p.code === map.standbyCode)?.name ?? 'ยังไม่กำหนด'}</span>
          <span className="text-xs">กลับจุดประจำ: {map.returnPolicy === 'after_job' ? 'หลังจบงาน (ค่าที่เตรียมไว้ ยังไม่สั่งหุ่น)' : 'เมื่อเจ้าหน้าที่สั่ง'}</span>
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy} className="btn btn-sm" onClick={() => { setBusy(true); void api(`/map-library/${map.id}/select`, { method: 'POST', body: '{}' }).then(() => { setPreviewPoint(null); return load(); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>เลือกแสดง</button>
            <button className="btn btn-sm" onClick={() => { const { id, updatedAt: _at, ...data } = map; setEditing(id); setInput(JSON.stringify(data, null, 2)); }}>แก้ไข</button>
            <button className="btn btn-sm" onClick={() => exportMap(map)}>ดาวน์โหลด JSON</button>
          </div>
        </div>)}
        {current && <div className="border border-line p-3 rounded">
          <svg viewBox={`-1 -1 ${current.widthM + 2} ${current.heightM + 2}`} className="w-full max-h-80 bg-surface-2" aria-label={`แผนผังทดลอง ${current.name}`}>
            <rect width={current.widthM} height={current.heightM} fill="white" stroke="#142d3b" strokeWidth=".05" />
            {current.pois.map(p => <g key={p.code} transform={`translate(${p.x},${current.heightM - p.y})`}><circle r=".16" fill={p.code === current.standbyCode ? '#087f80' : '#8b5cf6'} /><text x=".25" fontSize=".35">{p.name}</text></g>)}
            {previewPoint && <circle cx={previewPoint.x} cy={current.heightM - previewPoint.y} r=".23" fill="#c0182c"><title>ตำแหน่งจำลอง</title></circle>}
          </svg>
          <button className="btn" disabled={!current.standbyCode} onClick={() => { const p = current.pois.find(p => p.code === current.standbyCode); if (p) setPreviewPoint(p); }}>จำลองตำแหน่งที่จุดประจำ</button>
        </div>}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-bold">{editing ? 'แก้ไขแผนที่' : 'เพิ่มแผนที่'} / นำเข้า JSON</h2>
        <p className="text-sm">name = ชื่อสถานที่ · widthM/heightM = ขนาดเมตร · pois = จุดหมาย · standbyCode = รหัสจุดยืนรอ · returnPolicy = manual หรือ after_job</p>
        <input aria-label="นำเข้าแผนที่ JSON" type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 100000) { setError('ไฟล์ใหญ่เกิน 100 KB'); return; } void f.text().then(text => { setInput(text); setEditing(null); }).catch(() => setError('อ่านไฟล์ไม่ได้')); }} />
        <textarea className="input w-full font-mono text-sm min-h-[440px]" aria-label="ข้อมูลแผนที่ JSON" value={input} onChange={e => setInput(e.target.value)} />
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกลงคลัง'}</button>
      </section>
    </div>
  </div>;
}
