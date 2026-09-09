'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser, RobotMode } from '@hermes/shared';
import { api } from '../../lib/api';
import { RobotProvider, useRobot } from '../../lib/RobotContext';
import { SideNav } from '../../components/SideNav';
import { HeaderBar } from '../../components/HeaderBar';
import { LinkStatusBadge } from '../../components/LinkStatusBadge';
import { EStopButton } from '../../components/EStopButton';

const modeLabel: Record<RobotMode, string> = {
  idle: 'รอคำสั่ง',
  manual: 'ควบคุมด้วยมือ',
  navigating: 'กำลังเดิน',
  docking: 'กำลังกลับแท่นชาร์จ',
  stopped: 'หยุดฉุกเฉิน',
};

const modeTone: Record<RobotMode, string> = {
  idle: 'bg-surface-3 text-ink-2',
  manual: 'bg-navy text-white',
  navigating: 'bg-carbon-bg text-carbon',
  docking: 'bg-green-bg text-green',
  stopped: 'bg-red-bg text-red',
};

/**
 * Layout คอนโซล (spec §9):
 * SideNav 222px + Header (นาฬิกาพ.ศ. + สถานะเชื่อมต่อ + ผู้ใช้)
 * + แถบฉุกเฉิน (link status + mode + E-Stop ทุกหน้า)
 * + banner แดงเมื่อ link dead — ควบคุมไม่ได้ยกเว้น E-Stop
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let live = true;
    api<{ user: SessionUser }>('/auth/me')
      .then((r) => {
        if (!live) return;
        setUser(r.user);
        setAuth('in');
      })
      .catch(() => {
        if (live) setAuth('out');
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (auth === 'out') router.replace('/login');
  }, [auth, router]);

  if (auth !== 'in' || !user) {
    return (
      <div className="h-screen grid place-items-center text-ink-2 text-sm">
        กำลังตรวจสอบการเข้าสู่ระบบ…
      </div>
    );
  }

  return (
    <RobotProvider>
      <div className="h-screen flex overflow-hidden">
        <SideNav role={user.role} />
        <div className="flex-1 flex flex-col min-w-0">
          <HeaderBar user={user} />
          <EmergencyStrip />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </RobotProvider>
  );
}

function EmergencyStrip() {
  const { state } = useRobot();
  const dead = state?.linkStatus === 'dead';
  const stale = state?.linkStatus === 'stale';

  return (
    <div
      className={`shrink-0 flex items-center gap-3 px-4 h-12 border-b ${
        dead
          ? 'bg-red-bg border-red'
          : stale
            ? 'bg-amber-bg border-amber'
            : 'bg-surface border-line'
      }`}
    >
      {state ? (
        <>
          <LinkStatusBadge
            linkStatus={state.linkStatus}
            lastSeenAt={state.lastSeenAt}
            nowMs={Date.now()}
          />
          <span className="font-mono font-bold text-ink text-sm tabular">
            {state.robotCode}
          </span>
          {state.mode && (
            <span className={`badge border-transparent ${modeTone[state.mode]}`}>
              {modeLabel[state.mode]}
            </span>
          )}
          {state.simulated && (
            <span className="badge bg-surface-3 text-ink-3 border-transparent" title="กำลังใช้ข้อมูลจำลอง (RobotSim) — ยังไม่ได้ต่อ Hermes จริง">
              จำลอง (sim)
            </span>
          )}
          {dead && (
            <span className="text-sm font-semibold text-red">
              ลิงก์ขาด — ควบคุมหุ่นไม่ได้ ยกเว้น E-Stop (ค่าที่เห็นเป็นค่าสุดท้ายก่อนขาด)
            </span>
          )}
          {stale && (
            <span className="text-sm font-medium text-amber">
              สัญญาณอ่อน — ค่าที่แสดงอาจไม่สด (ดูอายุค่าในแต่ละช่อง)
            </span>
          )}
        </>
      ) : (
        <span className="text-sm text-ink-2">กำลังดึงสถานะหุ่น…</span>
      )}
      <div className="ml-auto">
        <EStopButton />
      </div>
    </div>
  );
}
