'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { JobSummary, MapFull } from '@hermes/shared';
import { api, ApiError } from '../../lib/api';
import { useRobot } from '../../lib/RobotContext';
import { useMe, useNow } from '../../lib/useMe';
import { PlanRenderer } from '../../components/PlanRenderer';
import { Reported } from '../../components/Reported';
import {
  fmtAgeMs,
  fmtDurationSec,
  fmtDateTime,
  fmtUptime,
  headingToCompass,
} from '../../lib/format';

/**
 * แดชบอร์ด (CON-02, CON-08) — ภาพรวมสถานะหุ่นตัวเดียว
 * ค่าที่หุ่นรายงาน = <Reported /> (carbon) · ค่าที่คอนโซลสั่ง = navy
 */
export default function DashboardPage() {
  const { state } = useRobot();
  const user = useMe();
  const now = useNow();
  const [map, setMap] = useState<MapFull | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  const t = state?.telemetry ?? null;
  const job = state?.currentJob ?? null;
  const routePoi =
    map && job ? map.pois.find((p) => p.code === job.destPoiCode) ?? null : null;

  const cancelJob = async (job: JobSummary) => {
    setCancelling(true);
    setCancelError(null);
    try {
      await api(`/jobs/${job.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'ยกเลิกจากแดชบอร์ด' }),
      });
    } catch (e) {
      setCancelError(e instanceof ApiError ? e.message : 'ยกเลิกงานไม่สำเร็จ');
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = user?.role === 'operator' || user?.role === 'admin';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* แผนที่ + หุ่น */}
      <section className="bg-surface border border-line rounded-[3px] p-4 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-sans font-semibold text-ink leading-heading">
            สถานะหุ่น — {state?.robotCode ?? '…'}
          </h1>
          {t && (
            <span className="text-xs text-ink-3 tabular" title="NFR-02: แสดงอายุของข้อมูล">
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
          <div className="h-64 grid place-items-center text-sm text-ink-3">
            กำลังโหลดแผนที่…
          </div>
        )}
      </section>

      {/* คอลัมน์ขวา: ค่า telemetery + งานปัจจุบัน */}
      <div className="flex flex-col gap-4 min-w-0">
        <section className="bg-surface border border-line rounded-[3px] p-4">
          <h2 className="text-sm font-semibold text-ink-2 mb-3">ค่าจากหุ่น</h2>
          {t ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat label="แบตเตอรี่">
                <Reported>{t.batteryPct}%</Reported>
              </Stat>
              <Stat label="ความเร็ว">
                <Reported>{t.speedMps.toFixed(2)} m/s</Reported>
              </Stat>
              <Stat label="ตำแหน่ง (x, y)">
                <Reported>
                  {t.x.toFixed(1)}, {t.y.toFixed(1)} m
                </Reported>
              </Stat>
              <Stat label="ทิศ">
                <Reported>{headingToCompass(t.headingDeg)}</Reported>
              </Stat>
              <Stat label="Wi-Fi">
                <Reported>{t.wifiDbm} dBm</Reported>
              </Stat>
              <Stat label="CPU">
                <Reported>{t.cpuPct}%</Reported>
              </Stat>
              <Stat label="ใช้งานมาแล้ว">
                <Reported>{fmtUptime(t.uptimeSec)}</Reported>
              </Stat>
              <Stat label="LiDAR">
                <span
                  className={`badge border-transparent ${
                    t.lidar === 'ok'
                      ? 'bg-green-bg text-green'
                      : t.lidar === 'warn'
                        ? 'bg-amber-bg text-amber'
                        : 'bg-red-bg text-red'
                  }`}
                >
                  {t.lidar === 'ok' ? 'ปกติ' : t.lidar === 'warn' ? 'แจ้งเตือน' : 'เสีย'}
                </span>
              </Stat>
            </dl>
          ) : (
            <p className="text-sm text-ink-3">ลิงก์ขาด — ยังไม่มีค่าสด (NFR-08)</p>
          )}
        </section>

        {/* งานปัจจุบัน (CON-08) */}
        <section className="bg-surface border border-line rounded-[3px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-2">งานปัจจุบัน</h2>
            {job && (
              <Link href="/control" className="text-xs text-navy hover:underline">
                ไปหน้าควบคุม →
              </Link>
            )}
          </div>
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
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Stat label="ระยะที่เหลือ">
                  <Reported>
                    {job.remainingM === null ? '—' : `${job.remainingM.toFixed(1)} m`}
                  </Reported>
                </Stat>
                <Stat label="คาดว่าจะถึง">
                  <Reported>{fmtDurationSec(job.etaSec)}</Reported>
                </Stat>
                <Stat label="ผู้สั่ง">
                  <span className="text-ink">{job.requestedByName ?? '—'}</span>
                </Stat>
                <Stat label="เริ่มเมื่อ">
                  <span className="text-ink tabular">{fmtDateTime(job.createdAt)}</span>
                </Stat>
              </dl>
              {canCancel && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => void cancelJob(job)}
                    disabled={cancelling}
                    className="btn btn-sm btn-error disabled:opacity-60"
                  >
                    {cancelling ? 'กำลังยกเลิก…' : 'ยกเลิกงาน'}
                  </button>
                  {cancelError && (
                    <span className="text-xs text-red">{cancelError}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-3">
              ไม่มีงานที่กำลังทำอยู่ — สั่งงานได้ที่{' '}
              <Link href="/control" className="text-navy hover:underline">
                หน้าควบคุม
              </Link>
            </p>
          )}
        </section>

        {/* lock (spec §6.2) */}
        <section className="bg-surface border border-line rounded-[3px] p-4">
          <h2 className="text-sm font-semibold text-ink-2 mb-2">การถือ lock</h2>
          {state?.lock.heldBy ? (
            <p className="text-sm text-ink leading-body">
              <span className="font-semibold">{state.lock.userName}</span>{' '}
              กำลังถือ lock แบบ{' '}
              <span className="font-semibold">{state.lock.mode === 'manual' ? 'มือ' : 'อัตโนมัติ'}</span>
              {state.lock.expiresAt && (
                <>
                  {' '}— หมดอายุใน{' '}
                  <span className="tabular font-mono">
                    {Math.max(0, Math.round((new Date(state.lock.expiresAt).getTime() - now) / 1000))}{' '}
                    วิ
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-ink-3">ไม่มีใครถือ lock</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
