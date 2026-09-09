'use client';

import { useEffect, useState } from 'react';
import type { SessionUser } from '@hermes/shared';
import { api } from '../lib/api';
import { useRobot } from '../lib/RobotContext';
import { fmtClock } from '../lib/format';

/**
 * แถบหัว: คำอธิบายหน้า + ป้าย fallback mode + นาฬิกาพ.ศ. (หลักข้อ 9) + ผู้ใช้ + ล็อกเอาท์
 */
export function HeaderBar({ user }: { user: SessionUser }) {
  const { connection } = useRobot();
  const [now, setNow] = useState<Date | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    setNow(new Date());
    return () => window.clearInterval(t);
  }, []);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // ไม่ว่าจะพลาดอย่างไรก็พาออกจากหน้าคอนโซล
    }
    window.location.href = '/login';
  };

  return (
    <header className="h-14 shrink-0 bg-surface border-b border-line flex items-center gap-3 px-4">
      <div className="hidden lg:block text-sm text-ink-2">
        Hermes Reception Control — คอนโซลผู้ดูแล
      </div>
      <div className="ml-auto flex items-center gap-3">
        {connection === 'polling' && (
          <span
            className="badge bg-amber-bg text-amber border-transparent"
            title="WebSocket ใช้ไม่ได้ — กำลัง poll REST ทุก 2 วินาที (spec §5.1)"
          >
            fallback mode (poll 2s)
          </span>
        )}
        {connection === 'connecting' && (
          <span className="badge bg-surface-3 text-ink-2 border-transparent">
            กำลังเชื่อมต่อ…
          </span>
        )}
        <span
          className="font-mono font-bold text-ink tabular text-sm"
          title="เวลาปัจจุบัน (ปฏิทินพุทธศักราช)"
        >
          {now ? fmtClock(now) : '--:--:--'}
        </span>
        <div className="flex items-center gap-2 pl-3 border-l border-line">
          <div className="text-right leading-tight">
            <div className="text-sm font-semibold text-ink">{user.displayName}</div>
            <div className="text-[0.65rem] uppercase tracking-wide text-ink-3">
              {user.role}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="btn btn-ghost btn-sm text-ink-2 hover:text-red disabled:opacity-50"
          >
            ออก
          </button>
        </div>
      </div>
    </header>
  );
}
