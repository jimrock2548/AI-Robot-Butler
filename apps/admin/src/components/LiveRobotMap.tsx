'use client';

import { useEffect, useRef, useState } from 'react';
import { useRobot } from '../lib/RobotContext';
import { fmtAgeMs, fmtDateTime } from '../lib/format';
import { useNow } from '../lib/useMe';
import type { RobotPoi, RobotWall } from '@hermes/shared';

/** Displays the robot's own SLAM coordinates, including negative map origins. */
export function LiveRobotMap({ onSelect, selected, onPoiSelect, selectionRequest = 0, draftWall }: {
  onSelect?: (point: { x: number; y: number }) => void;
  selected?: { x: number; y: number } | null;
  onPoiSelect?: (poi: RobotPoi) => void;
  selectionRequest?: number;
  draftWall?: { start: RobotWall['start']; end: RobotWall['end'] } | null;
}) {
  const { state, liveMap: map, mapError, connection } = useRobot();
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const telemetry = state?.telemetry;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'pan' | 'select'>(onSelect ? 'select' : 'pan');
  const selectionAvailable = !!onSelect;
  useEffect(() => {
    setTool(selectionAvailable ? 'select' : 'pan');
  }, [selectionAvailable, selectionRequest]);
  const [showLaser, setShowLaser] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const moved = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const changeZoom = (factor: number) => setZoom(value => Math.max(1, Math.min(8, value * factor)));
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.15 : 1 / 1.15); };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [!!map]);

  useEffect(() => {
    if (!map || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const cells = atob(map.cellsBase64);
    if (cells.length !== map.width * map.height) { setError('ข้อมูลแผนที่ไม่ครบ'); return; }
    const pixels = context.createImageData(map.width, map.height);
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const cell = cells.charCodeAt((map.height - row - 1) * map.width + col);
        // SLAMTEC SDK grayscale conversion: signed cell + 128.
        const gray = (cell < 128 ? cell : cell - 256) + 128;
        const offset = (row * map.width + col) * 4;
        pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = gray;
        pixels.data[offset + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    setError(null);
  }, [map?.cellsBase64, map?.width, map?.height]);

  const point = (x: number, y: number) => ({
    x: (x - map!.x) / map!.resolution,
    y: map!.height - (y - map!.y) / map!.resolution,
  });
  const robot = map && telemetry ? point(telemetry.x, telemetry.y) : null;
  const home = map?.home ? point(map.home.x, map.home.y) : null;
  const target = map && selected ? point(selected.x, selected.y) : null;
  const age = map ? Math.max(0, now - Date.parse(map.capturedAt)) : 0;
  const stale = age > 5000 || !!mapError;

  return <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-navy">แผนที่ SLAM จากหุ่นจริง</span>
      <span className={`badge ${stale ? 'bg-amber-bg text-amber' : 'bg-green-bg text-green'}`}>
        {stale ? 'ข้อมูลแผนที่ล่าช้า' : connection === 'ws' ? 'สด · WebSocket' : 'สด · โหมดสำรอง'}
      </span>
    </div>
    {(error || mapError) && <p role="alert" className="text-red text-sm">{error ?? mapError}</p>}
    {map ? <>
      <div className="flex flex-wrap gap-2 items-center text-xs" role="toolbar" aria-label="เครื่องมือแผนที่">
        <button type="button" className="btn btn-sm" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>ลากแผนที่</button>
        {onSelect && <button type="button" className="btn btn-sm" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>เลือกจุด</button>}
        <button type="button" className="btn btn-sm" aria-label="ซูมเข้า" onClick={() => changeZoom(1.25)}>＋</button>
        <button type="button" className="btn btn-sm" aria-label="ซูมออก" onClick={() => changeZoom(0.8)}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>เต็มแผนที่</button>
        <label className="flex gap-1"><input type="checkbox" checked={showLaser} onChange={event => setShowLaser(event.target.checked)} />LiDAR</label>
        <label className="flex gap-1"><input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} />กริด 1 m</label>
      </div>
      <div ref={viewport} className="relative w-full border border-line bg-surface-3 overflow-hidden select-none"
        style={{ aspectRatio: `${map.width} / ${map.height}`, touchAction: 'none' }}
        onPointerDown={event => {
          moved.current = false;
          if (tool !== 'pan' || event.button !== 0 || (event.target as Element).closest('[data-poi]')) return;
          drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
          if (Math.hypot(dx, dy) > 4) moved.current = true;
          setPan({ x: drag.current.px + dx, y: drag.current.py + dy });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <canvas ref={canvas} width={map.width} height={map.height} className="w-full h-full block"
          role="img" aria-label="แผนที่ SLAM ที่อ่านจากหุ่น" />
        <svg viewBox={`0 0 ${map.width} ${map.height}`} className="absolute inset-0 w-full h-full"
          style={{ cursor: tool === 'pan' ? 'grab' : onSelect && !stale ? 'crosshair' : 'default' }}
          onClick={(event) => {
            if (!onSelect || stale || tool !== 'select' || moved.current) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            onSelect({ x: map.x + (event.clientX - bounds.left) / bounds.width * map.width * map.resolution,
              y: map.y + (1 - (event.clientY - bounds.top) / bounds.height) * map.height * map.resolution });
          }}
          aria-label="ตำแหน่งหุ่นและแท่นชาร์จบนแผนที่">
          {showGrid && <><defs><pattern id="live-map-meter-grid" width={1 / map.resolution} height={1 / map.resolution} patternUnits="userSpaceOnUse"><path d={`M ${1 / map.resolution} 0 H 0 V ${1 / map.resolution}`} fill="none" stroke="#718096" strokeOpacity={0.3} strokeWidth={0.5} /></pattern></defs><rect width={map.width} height={map.height} fill="url(#live-map-meter-grid)" pointerEvents="none" /></>}
          {showLaser && map.laser && <g fill="#e53935" pointerEvents="none">
            {map.laser.laser_points.filter(p => p.valid && Number.isFinite(p.distance) && p.distance > 0 && p.distance < 50 && Number.isFinite(p.angle)).map((p, i) => {
              const scan = map.laser!;
              const hit = point(scan.pose.x + p.distance * Math.cos(scan.pose.yaw + p.angle), scan.pose.y + p.distance * Math.sin(scan.pose.yaw + p.angle));
              return <circle key={i} cx={hit.x} cy={hit.y} r={0.8 / Math.sqrt(zoom)} />;
            })}
          </g>}
          {map.pois?.filter(poi => poi.pose && [poi.pose.x, poi.pose.y, poi.pose.yaw].every(Number.isFinite)).map(poi => {
            const p = point(poi.pose!.x, poi.pose!.y);
            const name = typeof poi.metadata?.display_name === 'string' ? poi.metadata.display_name : poi.id;
            return <g key={poi.id} data-poi={poi.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: onPoiSelect ? 'pointer' : 'default' }}
              onClick={event => {
                event.stopPropagation();
                if (moved.current || stale) return;
                if (onPoiSelect) onPoiSelect(poi);
                else if (tool === 'select' && poi.pose) onSelect?.({ x: poi.pose.x, y: poi.pose.y });
              }}>
              <circle r={5} fill="#8b5cf6" stroke="white" strokeWidth={1.5} />
              <path d="M 5 0 L 10 0" stroke="#8b5cf6" strokeWidth={2} transform={`rotate(${-poi.pose!.yaw * 180 / Math.PI})`} />
              <text x={7} y={-7} fontSize={8} fill="#452080" stroke="white" strokeWidth={2} paintOrder="stroke">{name}</text><title>{name}</title>
            </g>;
          })}
          {home && <g><circle cx={home.x} cy={home.y} r={6} fill="#157347" stroke="white" strokeWidth={2} /><title>แท่นชาร์จ</title></g>}
          {map.walls?.map(wall => { const a = point(wall.start.x, wall.start.y), b = point(wall.end.x, wall.end.y); return <line key={`wall-${wall.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b91c1c" strokeWidth={3 / Math.sqrt(zoom)} pointerEvents="none"><title>กำแพงเสมือน #{wall.id}</title></line>; })}
          {draftWall && <line x1={point(draftWall.start.x, draftWall.start.y).x} y1={point(draftWall.start.x, draftWall.start.y).y} x2={point(draftWall.end.x, draftWall.end.y).x} y2={point(draftWall.end.x, draftWall.end.y).y} stroke="#0891b2" strokeWidth={3} strokeDasharray="5 3" pointerEvents="none" />}
          {robot && <g style={{ transform: `translate(${robot.x}px, ${robot.y}px) rotate(${-telemetry!.headingDeg}deg)`, transition: 'transform 450ms linear' }}>
            <circle r={7} fill="#12285A" stroke="white" strokeWidth={2} />
            <path d="M 16 0 L 5 -5 L 5 5 Z" fill="#C0182C" stroke="white" strokeWidth={1} />
            <title>ตำแหน่งที่หุ่นรายงาน</title>
          </g>}
          {target && <g stroke="#C0182C" strokeWidth={2} fill="none">
            <circle cx={target.x} cy={target.y} r={8} />
            <path d={`M ${target.x - 12} ${target.y} H ${target.x + 12} M ${target.x} ${target.y - 12} V ${target.y + 12}`} />
            <title>จุดที่เลือก · ยังไม่ส่งคำสั่ง</title>
          </g>}
        </svg>
        </div>
      </div>
      <div className="text-sm text-ink-2 flex flex-wrap gap-x-4 gap-y-1">
        <span>{map.modelName ?? 'Hermes'} · {map.softwareVersion ?? '—'}</span>
        <span>แผนที่ {(map.width * map.resolution).toFixed(2)} × {(map.height * map.resolution).toFixed(2)} m</span>
        <span>ความละเอียด {map.resolution.toFixed(3)} m/ช่อง</span>
        <span>POI {map.poiCount ?? '—'} จุด</span>
        <span>แท่น: {map.dockingStatus ?? '—'}</span>
        <span>{map.mappingEnabled === true ? 'โหมดสร้างแผนที่' : map.mappingEnabled === false ? 'โหมดระบุตำแหน่ง' : 'โหมดแผนที่ไม่ทราบ'}</span>
      </div>
      <p className={`text-sm p-3 border rounded-[3px] ${map.localizationQuality === null || map.localizationQuality < 50 ? 'text-amber bg-amber-bg border-amber' : 'text-ink-2 border-line'}`}>
        คุณภาพการระบุตำแหน่ง {map.localizationQuality ?? '—'}/100
        {(map.localizationQuality === null || map.localizationQuality < 50) && ' · ต้องตรวจตำแหน่งในแอปหุ่นก่อนทดสอบนำทาง'}
      </p>
      <p className="text-xs text-ink-3">น้ำเงิน = หุ่น · เขียว = แท่นชาร์จ · ม่วง = POI · แดง = LiDAR {map.laser ? '' : '(ยังไม่มีข้อมูลสแกน)'} · {fmtAgeMs(age)} · {fmtDateTime(map.capturedAt)} · แผนที่ประมาณ 1 วินาที / ตำแหน่งประมาณ 0.5 วินาที</p>
    </> : !error && <p className="text-sm text-ink-3">กำลังอ่านแผนที่จากหุ่น…</p>}
  </div>;
}
