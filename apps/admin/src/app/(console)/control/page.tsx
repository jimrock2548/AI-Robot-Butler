'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapFull } from '@hermes/shared';
import { api, ApiError } from '../../../lib/api';
import { useRobot } from '../../../lib/RobotContext';
import { useMe, useNow } from '../../../lib/useMe';
import { PlanRenderer } from '../../../components/PlanRenderer';
import { Joystick } from '../../../components/Joystick';
import { Reported } from '../../../components/Reported';
import {
  fmtAgeMs,
  fmtDurationSec,
  headingToCompass,
} from '../../../lib/format';

/**
 * หน้าควบคุม (CON-03, CON-04, CON-05)
 * - control lock ตาม spec §6.2: TTL 30 วิ, heartbeat 10 วิ, admin แย่งได้
 * - joystick ส่งผ่าน REST fallback POST /robot/manual (spec §8.2)
 * - E-Stop อยู่ในแถบฉุกเฉินทุกหน้า (กดได้โดยไม่ต้องถือ lock)
 */
export default function ControlPage() {
  const { state, connection } = useRobot();
  const me = useMe();
  const now = useNow();
  const [map, setMap] = useState<MapFull | null>(null);
  const [destCode, setDestCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const manualRef = useRef<number | null>(null);

  const t = state?.telemetry ?? null;
  const lock = state?.lock ?? null;
  const iHold = !!me && !!lock && lock.heldBy === me.id;
  const heldByOther = !!lock && lock.heldBy !== null && lock.heldBy !== me?.id;
  const canControl = me?.role === 'operator' || me?.role === 'admin';
  const isAdmin = me?.role === 'admin';
  const linkDead = state?.linkStatus === 'dead';

  useEffect(() => {
    let live = true;
    api<MapFull>('/maps/published')
      .then((m) => {
        if (live) setMap(m);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // heartbeat ทุก 10 วิ — ผู้ถือ manual lock เท่านั้น (spec §6.2)
  useEffect(() => {
    if (!iHold || lock?.mode !== 'manual') return;
    const tick = () => {
      api('/robot/lock/heartbeat', { method: 'POST', body: '{}' }).catch(() => {
        // พลาดรอบเดียวไม่เป็นไร — รอบถัดไปจะลองใหม่ / TTL จะจัดการ
      });
    };
    const t = window.setInterval(tick, 10_000);
    return () => window.clearInterval(t);
  }, [iHold, lock?.mode]);

  const act = async (name: string, fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'คำสั่งไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  /** joystick → REST fallback (throttle 100 ms = 10 Hz ตาม spec §5.2) */
  const onMove = (vx: number, vyaw: number) => {
    if (!iHold || lock?.mode !== 'manual' || linkDead) return;
    if (manualRef.current) window.clearTimeout(manualRef.current);
    manualRef.current = window.setTimeout(() => {
      api('/robot/manual', {
        method: 'POST',
        body: JSON.stringify({ vx, vyaw: Math.round(vyaw * 300) / 100 }),
      }).catch(() => {});
    }, 100);
  };

  const acquire = () =>
    act('lock', () => api('/robot/lock', { method: 'POST', body: JSON.stringify({ mode: 'manual' }) }));
  const release = () => act('release', () => api('/robot/lock', { method: 'DELETE' }));
  const sendTo = () =>
    act('send', () =>
      api('/jobs', {
        method: 'POST',
        body: JSON.stringify({ destPoiCode: destCode, source: 'operator' }),
      }),
    );
  const dock = () =>
    act('dock', () => api('/robot/dock', { method: 'POST', body: '{}' }));
  const halt = () => act('halt', () => api('/robot/halt', { method: 'POST', body: '{}' }));

  const job = state?.currentJob ?? null;
  const routePoi = map && job ? map.pois.find((p) => p.code === job.destPoiCode) ?? null : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* แผนที่ + joystick */}
      <section className="flex flex-col gap-4 min-w-0">
        <div className="bg-surface border border-line rounded-[3px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-sans font-semibold text-ink leading-heading">ควบคุมหุ่น</h1>
            {t && (
              <span className="text-xs text-ink-3 tabular">
                ค่าเมื่อ {fmtAgeMs(now - new Date(t.capturedAt).getTime())}
              </span>
            )}
          </div>
          {map ? (
            <PlanRenderer
              map={map}
              robot={t ? { x: t.x, y: t.y, headingDeg: t.headingDeg } : null}
              routeTo={routePoi}
              highlightPoiCode={job?.destPoiCode ?? null}
            />
          ) : (
            <div className="h-64 grid place-items-center text-sm text-ink-3">กำลังโหลดแผนที่…</div>
          )}
          {t && (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm mt-3">
              <Readout label="ความเร็ว">
                <Reported>{t.speedMps.toFixed(2)} m/s</Reported>
              </Readout>
              <Readout label="ทิศ">
                <Reported>{headingToCompass(t.headingDeg)}</Reported>
              </Readout>
              <Readout label="แบตเตอรี่">
                <Reported>{t.batteryPct}%</Reported>
              </Readout>
              <Readout label="ตำแหน่ง">
                <Reported>
                  {t.x.toFixed(1)}, {t.y.toFixed(1)} m
                </Reported>
              </Readout>
            </dl>
          )}
        </div>

        <div className="bg-surface border border-line rounded-[3px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-2">ควบคุมด้วยมือ (joystick)</h2>
            {iHold && lock?.mode === 'manual' && (
              <span className="badge bg-navy text-white border-transparent">คุณกำลังถือ lock</span>
            )}
          </div>

          {/* สถานะ lock */}
          {heldByOther && (
            <div className="mb-3 bg-amber-bg border border-amber rounded-[3px] p-3 text-sm text-ink">
              <span className="font-semibold">{lock?.userName}</span> กำลังควบคุมด้วยมือ
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => void acquire()}
                  disabled={busy !== null || linkDead}
                  className="btn btn-sm ml-3 disabled:opacity-60"
                  title="admin เท่านั้น — ระบบจะบันทึก audit (spec §6.2)"
                >
                  {busy === 'lock' ? 'กำลังแย่ง…' : 'แย่งการควบคุม (admin)'}
                </button>
              ) : (
                <span className="text-ink-2"> — รอเขาปล่อย lock</span>
              )}
            </div>
          )}
          {!lock?.heldBy && canControl && !job && (
            <div className="mb-3 flex items-center gap-3 text-sm text-ink-2">
              <span>ยังไม่มีใครถือ lock</span>
              <button
                type="button"
                onClick={() => void acquire()}
                disabled={busy !== null || linkDead}
                className="btn btn-primary btn-sm disabled:opacity-60"
              >
                {busy === 'lock' ? 'กำลังขอ…' : 'ขอถือ lock ควบคุมด้วยมือ'}
              </button>
            </div>
          )}
          {iHold && (
            <div className="mb-3 flex items-center gap-3 text-sm text-ink-2">
              <span>
                lock ของคุณ หมดอายุใน{' '}
                <span className="font-mono tabular">
                  {lock?.expiresAt
                    ? Math.max(0, Math.round((new Date(lock.expiresAt).getTime() - now) / 1000))
                    : '—'}{' '}
                  วิ
                </span>
              </span>
              <button
                type="button"
                onClick={() => void release()}
                disabled={busy !== null}
                className="btn btn-sm border-line-2 disabled:opacity-60"
              >
                {busy === 'release' ? 'กำลังปล่อย…' : 'ปล่อย lock'}
              </button>
            </div>
          )}
          {linkDead && (
            <p className="mb-3 text-sm text-red">ลิงก์ขาด — ควบคุมไม่ได้ ยกเว้น E-Stop (NFR-08)</p>
          )}

          <Joystick onMove={onMove} disabled={!iHold || linkDead} />

          {iHold && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void halt()}
                disabled={busy !== null || linkDead}
                className="btn border-line-2 disabled:opacity-60"
              >
                {busy === 'halt' ? 'กำลังหยุด…' : 'หยุดขับเคลื่อน (ไม่ยกเลิก job)'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* คอลัมน์ขวา: สั่งงาน + งานปัจจุบัน */}
      <div className="flex flex-col gap-4 min-w-0">
        <section className="bg-surface border border-line rounded-[3px] p-4">
          <h2 className="text-sm font-semibold text-ink-2 mb-3">สั่งไปจุดรับ (CON-04)</h2>
          {map ? (
            <div className="flex flex-col gap-2">
              <select
                value={destCode}
                onChange={(e) => setDestCode(e.target.value)}
                disabled={!canControl || !!job}
                className="select select-bordered w-full bg-surface disabled:opacity-50"
                aria-label="เลือกปลายทาง"
              >
                <option value="">— เลือกห้อง / จุดรับ —</option>
                {map.pois.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.nameTh}
                    {!p.isPublic ? ' (ไม่สาธารณะ)' : ''}
                    {p.isDock ? ' (แท่นชาร์จ)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void sendTo()}
                disabled={!canControl || !!job || !destCode || linkDead}
                className="btn btn-primary disabled:opacity-60"
              >
                {busy === 'send' ? 'กำลังสั่ง…' : 'สั่งหุ่นไปจุดนี้'}
              </button>
              {!canControl && (
                <p className="text-xs text-ink-3">สิทธิ์ viewer — ดูอย่างเดียว ไม่สามารถสั่งงานได้</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-3">กำลังโหลด…</p>
          )}
        </section>

        <section className="bg-surface border border-line rounded-[3px] p-4">
          <h2 className="text-sm font-semibold text-ink-2 mb-3">กลับแท่นชาร์จ (CON-05)</h2>
          <button
            type="button"
            onClick={() => void dock()}
            disabled={!canControl || !!job || linkDead}
            className="btn w-full disabled:opacity-60"
          >
            {busy === 'dock' ? 'กำลังสั่ง…' : 'สั่งกลับแท่นชาร์จ'}
          </button>
          <p className="text-xs text-ink-3 mt-2 leading-body">
            หุ่นจะกลับแท่นชาร์จอัตโนมัติเมื่อแบตต่ำกว่า 15% และไม่มีงานค้าง (sim จำลอง)
          </p>
        </section>

        {/* งานปัจจุบัน */}
        <section className="bg-surface border border-line rounded-[3px] p-4">
          <h2 className="text-sm font-semibold text-ink-2 mb-3">งานที่กำลังทำ</h2>
          {job ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-bold text-carbon tabular text-sm">{job.ref}</span>
                <span className="font-sans font-semibold text-navy">→ {job.destName}</span>
              </div>
              <div
                className="h-2 bg-surface-3 rounded-[2px] overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(job.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-navy transition-all"
                  style={{ width: `${Math.round(job.progress * 100)}%` }}
                />
              </div>
              <div className="flex gap-4 text-sm">
                <span>
                  เหลือ <Reported>{job.remainingM === null ? '—' : `${job.remainingM.toFixed(1)} m`}</Reported>
                </span>
                <span>
                  ถึงใน <Reported>{fmtDurationSec(job.etaSec)}</Reported>
                </span>
              </div>
              {canControl && (
                <button
                  type="button"
                  onClick={() =>
                    void act('cancel', () =>
                      api(`/jobs/${job.id}/cancel`, {
                        method: 'POST',
                        body: JSON.stringify({ reason: 'ยกเลิกจากหน้าควบคุม' }),
                      }),
                    )
                  }
                  disabled={busy !== null}
                  className="btn btn-error btn-sm self-start disabled:opacity-60"
                >
                  {busy === 'cancel' ? 'กำลังยกเลิก…' : 'ยกเลิกงาน'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-3">ไม่มีงานกำลังทำ — หุ่นสถานะ {state ? modeLabel(state.mode) : '…'}</p>
          )}
        </section>

        {/* แจ้งเตือน */}
        {(error || notice) && (
          <div
            role="alert"
            className={`text-sm px-3 py-2 rounded-[3px] ${
              error ? 'bg-red-bg text-red' : 'bg-green-bg text-green'
            }`}
          >
            {error ?? notice}
            {connection === 'polling' && (
              <span className="block text-xs opacity-80 mt-1">
                (WebSocket ใช้ไม่ได้ — กำลัง poll ทุก 2 วินาที)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'idle':
      return 'รอคำสั่ง';
    case 'manual':
      return 'ควบคุมด้วยมือ';
    case 'navigating':
      return 'กำลังนำทาง';
    case 'docking':
      return 'กำลังกลับแท่นชาร์จ';
    case 'stopped':
      return 'หยุดฉุกเฉิน';
    default:
      return mode;
  }
}
