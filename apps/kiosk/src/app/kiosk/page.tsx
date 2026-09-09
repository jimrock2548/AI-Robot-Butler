'use client';

import { useCallback, useEffect, useState } from 'react';
import type { JobSummary, KioskDestination, Lang } from '@hermes/shared';
import {
  KioskApiError,
  kioskCancel,
  kioskDestinations,
  kioskEscort,
  kioskSession,
} from '../../lib/api';

/**
 * จอหุ่น (spec §9.2) — /kiosk หน้าเดียว 7 ฉาก (Phase 1: idle / menu / escort / arrived)
 * - TH/EN สลับได้ ค่าเริ่มต้นไทย (RBT-05)
 * - ปุ่มหยุดเข้าถึงได้โดยไม่ต้องเลื่อน (RBT-06)
 * - สเกลด้วย container query — ห้ามผูกพิกเซล (NFR-10)
 */

type Scene = 'idle' | 'menu' | 'escort' | 'arrived';

const u = (n: number) => `calc(${n} * var(--u))`;

export default function KioskPage() {
  const [lang, setLang] = useState<Lang>('th');
  const [scene, setScene] = useState<Scene>('idle');
  const [dests, setDests] = useState<KioskDestination[] | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [busy, setBusy] = useState(false);

  const t = useCallback((th: string, en: string) => (lang === 'th' ? th : en), [lang]);

  /** 401 = token ไม่ตรง — แสดงหน้า error แยก */
  const fail = useCallback(
    (e: unknown): boolean => {
      if (e instanceof KioskApiError && e.code === 'http_401') {
        setAuthError(true);
        return true;
      }
      return false;
    },
    [],
  );

  const openMenu = useCallback(async () => {
    setError(null);
    setNotice(null);
    setScene('menu');
    setDests(null);
    try {
      const r = await kioskDestinations(lang);
      setDests(r.items);
    } catch (e) {
      if (!fail(e)) setError(t('โหลดรายการห้องไม่สำเร็จ', 'Could not load rooms'));
    }
  }, [lang, fail, t]);

  const choose = useCallback(
    async (d: KioskDestination) => {
      setBusy(true);
      setError(null);
      try {
        const j = await kioskEscort(d.code, lang);
        setJob(j);
        setScene('escort');
      } catch (e) {
        if (!fail(e)) {
          setError(
            e instanceof KioskApiError && e.code === 'job_in_progress'
              ? t('หุ่นกำลังพาคนอื่นอยู่ — กรุณารอสักครู่', 'The robot is busy — please wait a moment')
              : t('สั่งงานไม่สำเร็จ ลองใหม่อีกครั้ง', 'Could not start — please try again'),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [lang, fail, t],
  );

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      await kioskCancel();
      setJob(null);
      setScene('idle');
      setNotice(t('ยกเลิกแล้ว — ผมพร้อมพาไปอีกครั้ง', 'Cancelled — ready to go again'));
    } catch (e) {
      if (!fail(e)) setError(t('หยุดไม่สำเร็จ ลองอีกครั้ง', 'Could not stop — try again'));
    } finally {
      setBusy(false);
    }
  }, [fail, t]);

  const goHome = useCallback(() => {
    setJob(null);
    setError(null);
    setNotice(null);
    setScene('idle');
  }, []);

  // escort: poll /kiosk/session/:jobId ทุก 2 วินาที (spec §8.2 REST fallback)
  useEffect(() => {
    if (scene !== 'escort' || !job) return;
    let live = true;
    const load = async () => {
      try {
        const r = await kioskSession(job.id, lang);
        if (!live) return;
        const j = r.job;
        setJob(j);
        if (j.status === 'arrived') {
          setScene('arrived');
        } else if (j.status === 'cancelled' || j.status === 'stopped' || j.status === 'failed') {
          setJob(null);
          setScene('idle');
          setNotice(
            j.status === 'cancelled'
              ? t('ยกเลิกงานแล้ว', 'Job cancelled')
              : t('งานหยุดทำงาน', 'Job stopped'),
          );
        }
      } catch (e) {
        if (!live) return;
        if (e instanceof KioskApiError && e.code === 'not_found') {
          setJob(null);
          setScene('idle');
        } else if (!fail(e)) {
          // ลิงก์หลุด — poll รอบถัดไปจะลองใหม่ (ไม่แสดง error รุนแรง)
        }
      }
    };
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [scene, job?.id, lang, fail]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authError) {
    return (
      <div className="kiosk fixed inset-0 bg-surface flex flex-col items-center justify-center gap-4 text-center">
        <div style={{ fontSize: u(8) }} aria-hidden>
          ⚠️
        </div>
        <h1 style={{ fontSize: u(4.5) }} className="font-display font-bold text-ink m-0">
          {t('จอหุ่นเชื่อมต่อไม่ถูกต้อง', 'Kiosk authentication failed')}
        </h1>
        <p style={{ fontSize: u(2.6) }} className="text-ink-2 m-0">
          {t(
            'Device token ไม่ตรง — ติดต่อผู้ดูแลอาคาร (NFR-05)',
            'Device token mismatch — contact building admin',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="kiosk fixed inset-0 bg-surface flex flex-col overflow-hidden select-none">
      {/* header: โลโก้ + สลับภาษา (RBT-05) */}
      <header
        className="flex items-center justify-between shrink-0"
        style={{ padding: `${u(2)} ${u(4)}` }}
      >
        <span className="font-display font-bold tracking-wide text-navy" style={{ fontSize: u(3) }}>
          HERMES
        </span>
        <div
          className="flex border border-line-2 rounded"
          role="group"
          aria-label="เลือกภาษา"
          style={{ height: u(4.5) }}
        >
          {(['th', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`font-semibold transition-colors ${
                lang === l ? 'bg-navy text-white' : 'bg-surface text-ink-2'
              }`}
              style={{ padding: `0 ${u(3)}`, fontSize: u(2.2) }}
              aria-pressed={lang === l}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {/* body — ฉาก */}
      <main className="flex-1 min-h-0 flex flex-col" style={{ padding: u(4) }}>
        {scene === 'idle' && (
          <IdleScene
            t={t}
            onChoose={() => void openMenu()}
            busy={busy}
            notice={notice}
            error={error}
          />
        )}
        {scene === 'menu' && (
          <MenuScene
            t={t}
            dests={dests}
            onBack={goHome}
            onPick={(d) => void choose(d)}
            busy={busy}
            error={error}
          />
        )}
        {scene === 'escort' && job && (
          <EscortScene t={t} job={job} onStop={() => void stop()} busy={busy} />
        )}
        {scene === 'arrived' && (
          <ArrivedScene t={t} destName={job?.destName ?? ''} onHome={goHome} />
        )}
      </main>
    </div>
  );
}

type T = (th: string, en: string) => string;

function IdleScene({
  t,
  onChoose,
  busy,
  notice,
  error,
}: {
  t: T;
  onChoose: () => void;
  busy: boolean;
  notice: string | null;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
      {/* หุ่น — CSS เท่านั้น ไม่มีรูป */}
      <div aria-hidden className="flex flex-col items-center" style={{ gap: u(1) }}>
        <div
          className="bg-navy rounded flex items-center justify-center"
          style={{ width: u(14), height: u(12) }}
        >
          <div className="flex" style={{ gap: u(3) }}>
            <div className="bg-white rounded-full animate-pulse" style={{ width: u(2.6), height: u(2.6) }} />
            <div className="bg-white rounded-full animate-pulse" style={{ width: u(2.6), height: u(2.6) }} />
          </div>
        </div>
        <div className="bg-line-2 rounded" style={{ width: u(1.6), height: u(2) }} />
        <div className="bg-navy-2 rounded" style={{ width: u(18), height: u(9) }} />
      </div>

      <div>
        <h1 className="font-display font-bold text-ink m-0" style={{ fontSize: u(5) }}>
          {t('สวัสดีครับ', 'Hello!')}
        </h1>
        <p className="text-ink-2 m-0" style={{ fontSize: u(2.8) }}>
          {t('ผมพร้อมพาไปห้องต่าง ๆ ในอาคาร', 'I can take you to any room in the building')}
        </p>
      </div>

      {(notice || error) && (
        <p
          className={`m-0 ${error ? 'text-red' : 'text-green'}`}
          style={{ fontSize: u(2.4) }}
          role="status"
        >
          {error ?? notice}
        </p>
      )}

      <button
        type="button"
        onClick={onChoose}
        disabled={busy}
        className="bg-navy text-white font-display font-bold rounded disabled:opacity-60 active:bg-navy-2"
        style={{ width: '80%', height: u(11), fontSize: u(3.4) }}
      >
        {t('เลือกห้อง', 'Choose a room')}
      </button>
    </div>
  );
}

function MenuScene({
  t,
  dests,
  onBack,
  onPick,
  busy,
  error,
}: {
  t: T;
  dests: KioskDestination[] | null;
  onBack: () => void;
  onPick: (d: KioskDestination) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-ink-2 bg-surface border border-line rounded active:bg-surface-3"
        style={{ padding: `${u(1.2)} ${u(3)}`, fontSize: u(2.6) }}
      >
        ← {t('กลับ', 'Back')}
      </button>

      <h2 className="font-display font-bold text-ink m-0 mt-4 mb-4" style={{ fontSize: u(4) }}>
        {t('พาไปห้องไหนดี?', 'Where to?')}
      </h2>

      {error && (
        <p className="text-red m-0 mb-3" style={{ fontSize: u(2.4) }} role="alert">
          {error}
        </p>
      )}

      {dests === null ? (
        <p className="text-ink-3 m-0" style={{ fontSize: u(2.6) }}>
          {t('กำลังโหลด…', 'Loading…')}
        </p>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-y-auto grid content-start"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: u(3) }}
        >
          {dests.map((d) => (
            <button
              key={d.code}
              type="button"
              onClick={() => onPick(d)}
              disabled={busy}
              className="bg-surface border-2 border-line-2 rounded flex flex-col items-center justify-center gap-1 text-center active:bg-surface-3 active:border-navy disabled:opacity-50"
              style={{ minHeight: u(16) }}
            >
              {d.isDock && (
                <span
                  className="bg-amber text-white rounded-full font-bold"
                  style={{ width: u(5), height: u(5), fontSize: u(2.8), display: 'grid', placeItems: 'center' }}
                  aria-hidden
                >
                  ⚡
                </span>
              )}
              <span className="font-semibold text-ink" style={{ fontSize: u(2.8), padding: `0 ${u(1.5)}` }}>
                {d.nameTh === d.nameEn ? d.nameTh : t(d.nameTh, d.nameEn)}
              </span>
              <span className="text-ink-3" style={{ fontSize: u(1.8) }}>
                {d.code}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EscortScene({ t, job, onStop, busy }: { t: T; job: JobSummary; onStop: () => void; busy: boolean }) {
  const pct = Math.round(job.progress * 100);
  return (
    <div className="flex-1 flex flex-col items-center justify-between min-h-0">
      <div className="text-center w-full">
        <p className="text-ink-2 m-0" style={{ fontSize: u(2.8) }}>
          {t('กำลังพาไป…', 'On the way to')}
        </p>
        <h2 className="font-display font-bold text-navy m-0 mt-2" style={{ fontSize: u(5.5) }}>
          {job.destName}
        </h2>

        <div className="w-full mt-6" style={{ height: u(3) }}>
          <div
            className="h-full bg-surface-3 rounded overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-navy transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-baseline justify-center gap-2 mt-6">
          <span className="font-mono font-bold text-carbon tabular" style={{ fontSize: u(12) }}>
            {job.remainingM === null ? '—' : job.remainingM.toFixed(0)}
          </span>
          <span className="text-ink-2" style={{ fontSize: u(3.2) }}>
            {t('เมตร', 'm')}
          </span>
        </div>
        <p className="text-ink-3 m-0 mt-1" style={{ fontSize: u(2.2) }}>
          {t('ระยะที่เหลือ', 'remaining')}
        </p>
      </div>

      {/* RBT-06: ปุ่มหยุดเข้าถึงได้โดยไม่ต้องเลื่อน */}
      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        className="w-full bg-red text-white font-display font-bold rounded disabled:opacity-60 active:bg-red-2"
        style={{ height: u(10), fontSize: u(3.4) }}
      >
        {t('หยุด', 'STOP')}
      </button>
    </div>
  );
}

function ArrivedScene({ t, destName, onHome }: { t: T; destName: string; onHome: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
      <div
        className="bg-green text-white rounded-full font-bold grid place-items-center"
        style={{ width: u(16), height: u(16), fontSize: u(8) }}
        aria-hidden
      >
        ✓
      </div>
      <div>
        <h1 className="font-display font-bold text-ink m-0" style={{ fontSize: u(5) }}>
          {t('ถึงแล้วครับ', 'We have arrived')}
        </h1>
        <p className="text-navy font-semibold m-0 mt-2" style={{ fontSize: u(3.4) }}>
          {destName}
        </p>
      </div>
      <button
        type="button"
        onClick={onHome}
        className="bg-navy text-white font-display font-bold rounded active:bg-navy-2"
        style={{ width: '80%', height: u(10), fontSize: u(3.2) }}
      >
        {t('กลับหน้าแรก', 'Back to home')}
      </button>
    </div>
  );
}
