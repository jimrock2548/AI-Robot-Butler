'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RobotState } from '@hermes/shared';
import { API_URL, api } from './api';

/**
 * สถานะหุ่นตัวเดียว (spec §5.1):
 * - ทางหลัก = Socket.IO event 'telemetry' (broadcast 1000 ms)
 * - fallback = poll GET /api/robot/state ทุก 2 s พร้อมป้าย "fallback mode" ที่มองเห็นได้
 */
export type ConnectionState = 'connecting' | 'ws' | 'polling';

export function useRobotState(): {
  state: RobotState | null;
  connection: ConnectionState;
} {
  const [state, setState] = useState<RobotState | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | undefined;

    const startPolling = () => {
      if (pollTimer !== undefined || disposed) return;
      setConnection('polling');
      const tick = async () => {
        try {
          const s = await api<RobotState>('/robot/state');
          if (!disposed) setState(s);
        } catch {
          // backend ยังไม่พร้อม — ปล่อยค่าเดิมไว้ (จะแสดง banner)
        }
      };
      void tick();
      pollTimer = window.setInterval(tick, 2000);
    };

    const stopPolling = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true, // session cookie
      reconnectionAttempts: 2,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (disposed) return;
      setConnection('ws');
      stopPolling();
      // ดึง snapshot ทันทีเพื่อไม่ต้องรอ broadcast รอบถัดไป
      void api<RobotState>('/robot/state')
        .then((s) => {
          if (!disposed) setState(s);
        })
        .catch(() => {});
    });

    socket.on('telemetry', (s: RobotState) => {
      if (!disposed) setState(s);
    });

    socket.on('connect_error', () => {
      if (disposed) return;
      // 401 / ปฏิเสธการต่อ → โยกไป polling fallback (ยังเห็นข้อมูลถ้ามี session)
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      startPolling();
    });

    return () => {
      disposed = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      stopPolling();
    };
  }, []);

  return { state, connection };
}
