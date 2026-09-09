'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { User, UserRole } from '@hermes/shared';
import { api, ApiError } from '../../../../lib/api';
import { useMe } from '../../../../lib/useMe';
import { fmtDateTime } from '../../../../lib/format';

const ROLE_TH: Record<UserRole, string> = {
  viewer: 'ดูเท่านั้น (viewer)',
  operator: 'ปฏิบัติงาน (operator)',
  admin: 'ผู้ดูแล (admin)',
};

/**
 * จัดการผู้ใช้ (CON-07, CON-11) — admin เท่านั้น
 * แก้ displayName / email / role / isActive / password · soft delete (ห้ามลบตัวเอง)
 */
export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const me = useMe();

  const [user, setUser] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    role: 'viewer' as UserRole,
    isActive: true,
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<User>(`/users/${id}`)
      .then((u) => {
        setUser(u);
        setForm({
          displayName: u.displayName,
          email: u.email ?? '',
          role: u.role,
          isActive: u.isActive,
          password: '',
        });
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'not_found') setNotFound(true);
      });
  }, [id]);

  useEffect(load, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const body: Record<string, unknown> = {
      displayName: form.displayName.trim(),
      email: form.email.trim() === '' ? null : form.email.trim(),
      role: form.role,
      isActive: form.isActive,
    };
    if (form.password) body.password = form.password;
    try {
      const updated = await api<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setUser(updated);
      setForm((f) => ({ ...f, password: '' }));
      setNotice('บันทึกแล้ว');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!user) return;
    if (!window.confirm(`ระงับผู้ใช้ ${user.username} ? (soft delete — เก็บ audit ไว้ครบ)`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/users/${id}`, { method: 'DELETE' });
      setNotice('ระงับผู้ใช้แล้ว');
      setForm((f) => ({ ...f, isActive: false }));
      setUser((u) => (u ? { ...u, isActive: false } : u));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="text-sm text-ink-3">
        ไม่พบผู้ใช้{' '}
        <Link href="/users" className="text-navy hover:underline">
          กลับหน้าผู้ใช้
        </Link>
      </div>
    );
  }

  if (!user) {
    return <p className="text-sm text-ink-3">กำลังโหลด…</p>;
  }

  const isSelf = me?.id === user.id;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-sans font-semibold text-ink leading-heading">
          <span className="font-mono tabular">{user.username}</span>
          {isSelf && <span className="text-ink-3 ml-2">(คุณเอง)</span>}
        </h1>
        <Link href="/users" className="btn btn-sm border-line-2">
          ← กลับหน้าผู้ใช้
        </Link>
      </div>

      <section className="bg-surface border border-line rounded-[3px] p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">ชื่อแสดง</span>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="input input-bordered w-full bg-surface"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">อีเมล</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="— (ว่างได้)"
                className="input input-bordered w-full bg-surface"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">บทบาท</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="select select-bordered w-full bg-surface"
              >
                {(Object.keys(ROLE_TH) as UserRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_TH[r]}
                  </option>
                ))}
              </select>
              {isSelf && form.role !== 'admin' && (
                <span className="text-xs text-amber">
                  ระวัง: การลดบทบาทของตัวเองจะทำให้เข้าหน้าจัดการผู้ใช้ไม่ได้อีก
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              ใช้งานอยู่ (uncheck = ระงับบัญชี)
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-ink-3">ตั้งรหัสผ่านใหม่ (ว่าง = ไม่เปลี่ยน)</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="อย่างน้อย 8 ตัวอักษร"
                className="input input-bordered w-full bg-surface font-mono"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="text-xs text-ink-3">
            สร้างเมื่อ {fmtDateTime(user.createdAt)} · ล็อกอินล่าสุด {fmtDateTime(user.lastLoginAt)}
          </div>

          {(error || notice) && (
            <p
              role="alert"
              className={`text-sm px-3 py-2 rounded-[3px] ${
                error ? 'bg-red-bg text-red' : 'bg-green-bg text-green'
              }`}
            >
              {error ?? notice}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <div>
              {!isSelf && (
                <button
                  type="button"
                  onClick={() => remove()}
                  disabled={busy || !user.isActive}
                  className="btn btn-error btn-sm disabled:opacity-50"
                >
                  {user.isActive ? 'ระงับผู้ใช้ (soft delete)' : '—'}
                </button>
              )}
              {isSelf && (
                <span className="text-xs text-ink-3">ห้ามลบบัญชีของตัวเอง (spec §8.5)</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => save()}
              disabled={busy || form.displayName.trim().length === 0}
              className="btn btn-primary disabled:opacity-60"
            >
              {busy ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
