'use client';

import { useEffect, useState } from 'react';
import type { SessionUser } from '@hermes/shared';
import { api } from './api';

/** ผู้ใช้ที่ล็อกอินอยู่ (CON-11) — แต่ละหน้าเรียกเองเพราะ layout ไม่ได้ pass user ลงมา */
export function useMe(): SessionUser | null {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let live = true;
    api<{ user: SessionUser }>('/auth/me')
      .then((r) => {
        if (live) setUser(r.user);
      })
      .catch(() => {
        // layout จะพาไป /login เอง
      });
    return () => {
      live = false;
    };
  }, []);
  return user;
}

/** นาฬิกาสำหรับคำนวณอายุค่า (NFR-02) — refresh ทุก 1 วินาที */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
