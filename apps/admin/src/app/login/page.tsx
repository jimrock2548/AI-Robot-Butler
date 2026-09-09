'use client';

import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { SessionUser } from '@hermes/shared';

/**
 * หน้าล็อกอิน + สมัครสมาชิก (CON-01: บัญชีใหม่ = viewer เสมอ)
 * บัญชีเดโม (DB_MODE=memory): admin/admin123 · operator/operator123 · viewer/viewer123
 */
export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path =
        tab === 'login'
          ? '/auth/login'
          : '/auth/register';
      const body =
        tab === 'login'
          ? { username, password }
          : { username, displayName, email, password };
      await api<{ user: SessionUser }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const detail = err.detail as Record<string, string> | undefined;
        if (detail) setError(`${err.message} — ${detail.username ?? ''}`.trim());
      } else {
        setError('ต่อ backend ไม่ได้ — ตรวจสอบว่า pnpm dev:backend กำลังทำงาน (port 4000)');
      }
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'input input-bordered w-full bg-surface border-line-2 focus:border-navy';

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="font-sans font-bold text-2xl text-navy tracking-wide">HERMES</div>
          <div className="text-sm text-ink-2">Reception Control — คอนโซลผู้ดูแล</div>
        </div>

        <div className="bg-surface border border-line rounded-[3px] p-6">
          <div role="tablist" className="flex mb-5 border-b border-line">
            {(
              [
                ['login', 'เข้าสู่ระบบ'],
                ['register', 'สมัครสมาชิก'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key);
                  setError(null);
                }}
                className={`flex-1 pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === key
                    ? 'border-navy text-navy'
                    : 'border-transparent text-ink-3 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-2">Username</span>
              <input
                className={inputCls}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            {tab === 'register' && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-2">ชื่อแสดง (displayName)</span>
                  <input
                    className={inputCls}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-2">อีเมล (ไม่บังคับ)</span>
                  <input
                    className={inputCls}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
              </>
            )}

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-2">รหัสผ่าน</span>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                minLength={tab === 'register' ? 8 : undefined}
                required
              />
            </label>

            {error && (
              <div role="alert" className="text-sm text-red bg-red-bg px-3 py-2 rounded-[3px]">
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary mt-1 disabled:opacity-60">
              {busy ? 'กำลังดำเนินการ…' : tab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก (สิทธิ์ viewer)'}
            </button>
          </form>
        </div>

        <div className="mt-4 bg-surface-2 border border-line rounded-[3px] p-3 text-xs text-ink-2 leading-body">
          <div className="font-semibold text-ink mb-1">บัญชีเดโม (โหมด memory):</div>
          <ul className="flex flex-col gap-0.5 font-mono">
            <li>admin / admin123 — ผู้ดูแล (แก้แผนที่/ผู้ใช้/แย่ง lock)</li>
            <li>operator / operator123 — ผู้ปฏิบัติการ (สั่งงาน/ควบคุม)</li>
            <li>viewer / viewer123 — ดูอย่างเดียว</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
