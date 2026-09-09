'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { User, UserRole } from '@hermes/shared';
import { api, ApiError } from '../../../lib/api';
import { useMe } from '../../../lib/useMe';
import { fmtDateTime } from '../../../lib/format';

const ROLE_TH: Record<UserRole, string> = {
  viewer: 'ดูเท่านั้น (viewer)',
  operator: 'ปฏิบัติงาน (operator)',
  admin: 'ผู้ดูแล (admin)',
};

/**
 * ผู้ใช้ (CON-07, CON-11) — admin เท่านั้น (route backend บังคับ requireRole)
 * - รายการผู้ใช้ + สร้างผู้ใช้ใหม่
 * - แก้ไข/ลบที่ /users/[id]
 */
export default function UsersPage() {
  const me = useMe();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '', role: 'viewer' as UserRole });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<User[]>('/users')
      .then(setUsers)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ'));
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          email: form.email.trim() || undefined,
          password: form.password,
          role: form.role,
        }),
      });
      setShowCreate(false);
      setForm({ username: '', displayName: '', email: '', password: '', role: 'viewer' });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างผู้ใช้ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-sans font-semibold text-ink leading-heading">ผู้ใช้</h1>
        <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
          + เพิ่มผู้ใช้
        </button>
      </div>

      <section className="bg-surface border border-line rounded-[3px] overflow-x-auto">
        {users ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 border-b border-line">
                <th className="px-4 py-3 font-medium">ชื่อผู้ใช้</th>
                <th className="px-4 py-3 font-medium">ชื่อแสดง</th>
                <th className="px-4 py-3 font-medium">อีเมล</th>
                <th className="px-4 py-3 font-medium">บทบาท</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ล็อกอินล่าสุด</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-line ${!u.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono tabular">
                    {u.username}
                    {me?.id === u.id && <span className="text-ink-3 ml-2">(คุณ)</span>}
                  </td>
                  <td className="px-4 py-3">{u.displayName}</td>
                  <td className="px-4 py-3 text-ink-2">{u.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge border-transparent ${
                        u.role === 'admin'
                          ? 'bg-navy text-white'
                          : u.role === 'operator'
                            ? 'bg-green-bg text-green'
                            : 'bg-surface-3 text-ink-2'
                      }`}
                    >
                      {ROLE_TH[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="badge bg-green-bg text-green border-transparent">ใช้งาน</span>
                    ) : (
                      <span className="badge bg-surface-3 text-ink-2 border-transparent">ระงับ</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2 tabular">{fmtDateTime(u.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/users/${u.id}`}
                      className="btn btn-xs border-line-2"
                    >
                      จัดการ
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-ink-3">
            {error ? <span className="text-red">{error}</span> : 'กำลังโหลด…'}
          </p>
        )}
      </section>

      {/* create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-surface border border-line rounded-[3px] w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink">เพิ่มผู้ใช้ใหม่</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-sm border-line-2">
                ปิด
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <Field label="ชื่อผู้ใช้ (username)">
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="อย่างน้อย 3 ตัวอักษร a-z 0-9 _ . -"
                  className="input input-bordered w-full bg-surface font-mono"
                  autoComplete="off"
                />
              </Field>
              <Field label="ชื่อแสดง">
                <input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  className="input input-bordered w-full bg-surface"
                />
              </Field>
              <Field label="อีเมล (ถ้ามี)">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input input-bordered w-full bg-surface"
                />
              </Field>
              <Field label="รหัสผ่าน">
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                  className="input input-bordered w-full bg-surface font-mono"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="บทบาท">
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
              </Field>
              {error && <p className="text-red text-xs">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowCreate(false)} className="btn border-line-2">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => create()}
                disabled={
                  busy ||
                  form.username.trim().length < 3 ||
                  form.displayName.trim().length === 0 ||
                  form.password.length < 8
                }
                className="btn btn-primary disabled:opacity-60"
              >
                {busy ? 'กำลังสร้าง…' : 'สร้างผู้ใช้'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-3">{label}</span>
      {children}
    </label>
  );
}
