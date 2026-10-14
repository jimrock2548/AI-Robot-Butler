'use client';

import { useEffect, useState } from 'react';
import type { JobDetail, JobSource, JobStatus, JobSummary } from '@hermes/shared';
import { api, ApiError } from '../../../lib/api';
import { useRobot } from '../../../lib/RobotContext';
import { useMe } from '../../../lib/useMe';
import { Reported } from '../../../components/Reported';
import {
  fmtDateTime,
  fmtDurationSec,
} from '../../../lib/format';

const LIMIT = 25;

const STATUS_TH: Record<JobStatus, string> = {
  queued: 'รอคิว',
  navigating: 'กำลังไป',
  arrived: 'ถึงแล้ว',
  cancelled: 'ยกเลิก',
  failed: 'ล้มเหลว',
  stopped: 'หยุดฉุกเฉิน',
};

const SOURCE_TH: Record<JobSource, string> = {
  operator: 'ผู้ปฏิบัติงาน',
  kiosk_touch: 'จอหุ่น (แตะ)',
  kiosk_voice: 'จอหุ่น (เสียง)',
  auto: 'ระบบอัตโนมัติ',
};

const EVENT_TH: Record<string, string> = {
  created: 'สร้างงาน',
  departed: 'เริ่มเดินทาง',
  arrived: 'ถึงจุดหมาย',
  cancelled: 'ยกเลิก',
  failed: 'ล้มเหลว',
  stopped: 'หยุดฉุกเฉิน',
};

/**
 * งาน (CON-10) — ตารางงาน + filter status/source/ช่วงเวลา + pagination
 * + งานปัจจุบัน (live จาก RobotContext) + รายละเอียดพร้อม job_events
 */
export default function JobsPage() {
  const { state } = useRobot();
  const me = useMe();

  // filters
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [list, setList] = useState<{ items: JobSummary[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // detail
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // list — refresh ทุก 5 วิ เพื่อให้ progress สด (ใช้ limit ไม่มาก)
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (source) params.set('source', source);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    api<{ items: JobSummary[]; total: number }>(`/jobs?${params.toString()}`)
      .then((r) => {
        if (live) setList(r);
      })
      .catch((e) => {
        if (live) setLoadError(e instanceof ApiError ? e.message : 'โหลดรายการงานไม่สำเร็จ');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [status, source, from, to, page]);

  // detail — refresh ทุก 2 วิตราบที่เปิด
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let live = true;
    const load = () =>
      api<JobDetail>(`/jobs/${selectedId}`)
        .then((d) => {
          if (live) setDetail(d);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 2000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [selectedId]);

  const current = state?.currentJob ?? null;
  const canCancel = me?.role === 'operator' || me?.role === 'admin';
  const totalPages = list ? Math.max(1, Math.ceil(list.total / LIMIT)) : 1;

  const cancel = (job: JobSummary) => {
    setCancelling(true);
    setCancelError(null);
    api(`/jobs/${job.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'ยกเลิกจากหน้างาน (CON-10)' }),
    })
      .catch((e) => setCancelError(e instanceof ApiError ? e.message : 'ยกเลิกไม่สำเร็จ'))
      .finally(() => setCancelling(false));
  };

  const resetFilters = () => {
    setStatus('');
    setSource('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-sans font-semibold text-ink leading-heading">งาน (Jobs)</h1>
        {loading && <span className="text-xs text-ink-3">กำลังอัปเดต…</span>}
      </div>

      {/* งานปัจจุบัน — live (CON-08) */}
      <section className="bg-surface border border-line rounded-[3px] p-4">
        <h2 className="text-sm font-semibold text-ink-2 mb-2">งานที่กำลังทำ (สด)</h2>
        {current ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-bold text-carbon tabular text-sm">{current.ref}</span>
              <span className="font-sans font-semibold text-navy">→ {current.destName}</span>
            </div>
            <div className="flex-1 max-w-xs">
              <div
                className="h-2 bg-surface-3 rounded-[2px] overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(current.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-navy transition-all"
                  style={{ width: `${Math.round(current.progress * 100)}%` }}
                />
              </div>
            </div>
            <span className="text-sm">
              เหลือ <Reported>{current.remainingM === null ? '—' : `${current.remainingM.toFixed(1)} m`}</Reported>
              {' · '}ถึงใน <Reported>{fmtDurationSec(current.etaSec)}</Reported>
            </span>
            {canCancel && (
              <button
                type="button"
                onClick={() => cancel(current)}
                disabled={cancelling}
                className="btn btn-error btn-sm disabled:opacity-60"
              >
                {cancelling ? 'กำลังยกเลิก…' : 'ยกเลิก'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">ไม่มีงานกำลังทำ — หุ่น {state ? modeLabel(state.mode) : '…'}</p>
        )}
      </section>

      {/* filters (CON-10) */}
      <section className="bg-surface border border-line rounded-[3px] p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Filter label="สถานะ">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="select select-bordered w-full bg-surface text-sm"
              aria-label="กรองตามสถานะ"
            >
              <option value="">ทั้งหมด</option>
              {(Object.keys(STATUS_TH) as JobStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_TH[s]}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="แหล่งสั่ง">
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
              className="select select-bordered w-full bg-surface text-sm"
              aria-label="กรองตามแหล่งสั่ง"
            >
              <option value="">ทั้งหมด</option>
              {(Object.keys(SOURCE_TH) as JobSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_TH[s]}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="ตั้งแต่วันที่">
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="input input-bordered w-full bg-surface text-sm"
              aria-label="เริ่มช่วงวันที่"
            />
          </Filter>
          <Filter label="ถึงวันที่">
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="input input-bordered w-full bg-surface text-sm"
              aria-label="สิ้นสุดช่วงวันที่"
            />
          </Filter>
          <button
            type="button"
            onClick={resetFilters}
            className="btn btn-sm border-line-2 h-fit"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </section>

      {/* ตาราง */}
      <section className="bg-surface border border-line rounded-[3px] overflow-x-auto">
        {loadError ? (
          <p className="p-4 text-sm text-red">{loadError}</p>
        ) : list ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 border-b border-line">
                <th className="px-4 py-3 font-medium">อ้างอิง</th>
                <th className="px-4 py-3 font-medium">จุดหมาย</th>
                <th className="px-4 py-3 font-medium">แหล่งสั่ง</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ผู้สั่ง</th>
                <th className="px-4 py-3 font-medium">เริ่มเมื่อ</th>
                <th className="px-4 py-3 font-medium text-right">ระยะที่เหลือ</th>
              </tr>
            </thead>
            <tbody>
              {list.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                    ไม่พบงานที่ตรงกับตัวกรอง
                  </td>
                </tr>
              )}
              {list.items.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => setSelectedId(j.id)}
                  className={`cursor-pointer border-b border-line hover:bg-surface-2 ${
                    selectedId === j.id ? 'bg-surface-2' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono tabular text-carbon font-semibold">{j.ref}</span>
                  </td>
                  <td className="px-4 py-3 text-navy font-medium">{j.destName}</td>
                  <td className="px-4 py-3 text-ink-2">{SOURCE_TH[j.source]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-2">{j.requestedByName ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-2 tabular">{fmtDateTime(j.createdAt)}</td>
                  <td className="px-4 py-3 text-right tabular">
                    {j.status === 'navigating' || j.status === 'queued' ? (
                      <Reported>{j.remainingM === null ? '—' : `${j.remainingM.toFixed(1)} m`}</Reported>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-ink-3">กำลังโหลด…</p>
        )}

        {/* pagination */}
        {list && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink-3 tabular">
              ทั้งหมด {list.total} รายการ · หน้า {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-sm border-line-2 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-sm border-line-2 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </section>

      {/* รายละเอียดงาน */}
      {selectedId !== null && (
        <section className="bg-surface border border-line rounded-[3px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-2">
              รายละเอียดงาน {detail ? <span className="font-mono text-carbon tabular">{detail.ref}</span> : '…'}
            </h2>
            <button type="button" onClick={() => setSelectedId(null)} className="btn btn-sm border-line-2">
              ปิด
            </button>
          </div>
          {detail ? (
            <div className="grid gap-6 md:grid-cols-2">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <KV label="จุดหมาย">
                  <span className="text-navy font-medium">{detail.destName}</span>
                </KV>
                <KV label="แหล่งสั่ง">{SOURCE_TH[detail.source]}</KV>
                <KV label="สถานะ">
                  <StatusBadge status={detail.status} />
                </KV>
                <KV label="ผู้สั่ง">{detail.requestedByName ?? '—'}</KV>
                <KV label="เริ่มเมื่อ">{fmtDateTime(detail.createdAt)}</KV>
                <KV label="เริ่มเดินทาง">{fmtDateTime(detail.departedAt)}</KV>
                <KV label="ระยะทั้งหมด">{detail.distanceM === null ? '—' : `${detail.distanceM.toFixed(1)} m`}</KV>
                <KV label="แผนที่">{detail.mapVersion === 0 ? 'แผนที่บนหุ่น' : `v${detail.mapVersion}`}</KV>
                {detail.cancelReason && <KV label="เหตุผลการยกเลิก">{detail.cancelReason}</KV>}
                {detail.arrivedAt && <KV label="ถึงเมื่อ">{fmtDateTime(detail.arrivedAt)}</KV>}
              </dl>
              <div>
                <h3 className="text-xs font-semibold text-ink-3 mb-2">เหตุการณ์ (job_events)</h3>
                <ol className="flex flex-col gap-1">
                  {detail.events.length === 0 && <li className="text-sm text-ink-3">ยังไม่มีเหตุการณ์</li>}
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-3 text-sm">
                      <span className="tabular text-ink-3 shrink-0">{fmtDateTime(e.at)}</span>
                      <span className="font-medium">{EVENT_TH[e.kind] ?? e.kind}</span>
                      {e.detail && (
                        <span className="text-xs text-ink-3 truncate" title={JSON.stringify(e.detail)}>
                          {JSON.stringify(e.detail)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {(detail.status === 'navigating' || detail.status === 'queued') && canCancel && (
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cancel(detail)}
                      disabled={cancelling}
                      className="btn btn-error btn-sm disabled:opacity-60"
                    >
                      {cancelling ? 'กำลังยกเลิก…' : 'ยกเลิกรายงานนี้'}
                    </button>
                    {cancelError && <span className="text-xs text-red">{cancelError}</span>}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-3">กำลังโหลดรายละเอียด…</p>
          )}
        </section>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const cls =
    status === 'navigating'
      ? 'bg-navy text-white'
      : status === 'arrived'
        ? 'bg-green-bg text-green'
        : status === 'cancelled' || status === 'stopped' || status === 'failed'
          ? 'bg-red-bg text-red'
          : 'bg-surface-3 text-ink-2';
  return (
    <span className={`badge border-transparent ${cls}`}>
      {STATUS_TH[status]}
    </span>
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
