'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RobotState, LiveRobotMap } from '@hermes/shared';
import { API_URL, api } from './api';
import { ageRobotState } from './robotFreshness';

/**
 * สถานะหุ่นตัวเดียว (spec §5.1):
 * - ทางหลัก = Socket.IO event 'telemetry' (broadcast 1000 ms)
 * - fallback = poll GET /api/robot/state ทุก 2 s พร้อมป้าย "fallback mode" ที่มองเห็นได้
 */
export type ConnectionState = 'connecting' | 'ws' | 'polling';

export function useRobotState(): {
  state: RobotState | null;
  connection: ConnectionState;
  liveMap: LiveRobotMap | null;
  mapError: string | null;
} {
  const [sample, setSample] = useState<RobotState | null>(null);
  const receivedAt = useRef(0);
  const [clock, setClock] = useState(() => Date.now());
  const setState = (value: RobotState) => { receivedAt.current = Date.now(); setSample(value); };
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [liveMap, setLiveMap] = useState<LiveRobotMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | undefined;
    let pollBusy = false;
    const loadMap = async () => {
      try {
        const map = await api<LiveRobotMap>('/robot/live-map');
        if (!disposed) { setLiveMap(map); setMapError(null); }
      } catch { if (!disposed) setMapError('อ่านแผนที่จากหุ่นไม่ได้'); }
    };

    const startPolling = () => {
      if (pollTimer !== undefined || disposed) return;
      setConnection('polling');
      const tick = async () => {
        if (pollBusy) return;
        pollBusy = true;
        try {
          const s = await api<RobotState>('/robot/state');
          if (!disposed) setState(s);
          if (!s.simulated || s.mockConnected) await loadMap();
        } catch {
          // backend ยังไม่พร้อม — ปล่อยค่าเดิมไว้ (จะแสดง banner)
        } finally { pollBusy = false; }
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
          if (!s.simulated || s.mockConnected) void loadMap();
        })
        .catch(() => {});
    });

    socket.on('telemetry', (s: RobotState) => {
      if (!disposed) setState(s);
    });
    socket.on('map:live', (map: LiveRobotMap) => {
      if (!disposed) { setLiveMap(map); setMapError(null); }
    });
    socket.on('map:live-error', (error: { message: string }) => {
      if (!disposed) setMapError(error.message);
    });
    socket.on('map:reset', () => {
      if (!disposed) { setLiveMap(null); setMapError('กำลังรอแผนที่ SLAM ใหม่จากหุ่น'); }
    });
    socket.on('disconnect', () => { if (!disposed) startPolling(); });

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

  return { state: ageRobotState(sample, receivedAt.current, clock), connection, liveMap, mapError };
}
