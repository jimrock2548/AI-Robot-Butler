'use client';

import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useRobot } from '../lib/RobotContext';

/**
 * ปุ่ม E-Stop — แถบฉุกเฉินทุกหน้า (spec §9)
 * ยิงผ่าน REST ตรง ไม่ผ่าน WebSocket (NFR-07)
 * ผู้ใช้ที่ล็อกอินทุกคนกดได้ (spec §6.2 ข้อ 3) — ไม่ต้องถือ lock
 */
export function EStopButton() {
  const { state } = useRobot();
  const readOnly = !state || !state.commandsEnabled;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/robot/estop', { method: 'POST', body: '{}' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สั่ง E-Stop ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={press}
        disabled={busy || readOnly}
        aria-label="หยุดฉุกเฉิน E-Stop"
        title="หยุดฉุกเฉิน — หยุดหุ่นทันที ยกเลิกงานและปลด lock (ทุกหน้าที่ล็อกอินเข้า)"
        className="btn btn-error h-10 min-h-10 px-5 font-sans font-bold disabled:opacity-60"
      >
        <span className="leading-none">
          E-STOP <span className="font-medium">· {readOnly ? 'ใช้ปุ่มบนตัวหุ่น' : 'หยุดฉุกเฉิน'}</span>
        </span>
      </button>
      {error && <span className="text-xs text-red max-w-40 text-left">{error}</span>}
    </div>
  );
}
