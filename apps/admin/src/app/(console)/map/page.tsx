'use client';

import { useCallback, useEffect, useState } from 'react';
import type { KeepoutZone, MapFull, MapVersionSummary, Poi } from '@hermes/shared';
import { api, ApiError } from '../../../lib/api';
import { useRobot } from '../../../lib/RobotContext';
import { useMe } from '../../../lib/useMe';
import { PlanRenderer } from '../../../components/PlanRenderer';
import { fmtDateTime } from '../../../lib/format';

/**
 * แผนที่ (CON-06, CON-09)
 * - ทุกบทบาท: ดูเวอร์ชันที่เผยแพร่ + ประวัติเวอร์ชัน
 * - admin เท่านั้น: สร้างร่าง / แก้ POI / keepouts / เผยแพร่ / rollback
 */
export default function MapPage() {
  const { state } = useRobot();
  const me = useMe();
  const isAdmin = me?.role === 'admin';

  const [published, setPublished] = useState<MapFull | null>(null);
  const [draft, setDraft] = useState<MapFull | null>(null);
  const [versions, setVersions] = useState<MapVersionSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // POI form (draft)
  const [editing, setEditing] = useState<Poi | null>(null);
  const [form, setForm] = useState<PoiForm | null>(null);

  // keepout form (draft)
  const [koName, setKoName] = useState('');
  const [koPoints, setKoPoints] = useState('0,0 4,0 0,4');

  const loadPublished = useCallback(() => {
    api<MapFull>('/maps/published')
      .then(setPublished)
      .catch(() => {});
  }, []);

  const loadVersions = useCallback(() => {
    api<MapVersionSummary[]>('/maps/versions')
      .then(setVersions)
      .catch(() => {});
  }, []);

  const loadDraft = useCallback(() => {
    api<MapFull>('/maps/draft')
      .then(setDraft)
      .catch((e) => {
        if (e instanceof ApiError && e.code === 'not_found') setDraft(null);
        else setDraft(null);
      });
  }, []);

  useEffect(() => {
    loadPublished();
    loadVersions();
    if (isAdmin) loadDraft();
  }, [isAdmin, loadPublished, loadVersions, loadDraft]);

  const act = async (
    name: string,
    fn: () => Promise<unknown>,
    okMsg?: string,
  ): Promise<unknown> => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (okMsg) setNotice(okMsg);
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ไม่สำเร็จ');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const createDraft = () =>
    act('draft', () => api('/maps/draft', { method: 'POST', body: '{}' }), 'สร้างฉบับร่างแล้ว').then(() => {
      loadDraft();
      loadVersions();
    });

  const importMap = async (file: File) => {
    try {
      const body = JSON.parse(await file.text()) as unknown;
      const result = await act('import', () => api('/maps/import', {
        method: 'POST', body: JSON.stringify(body),
      }), 'นำเข้าแผนที่เป็นฉบับร่างแล้ว');
      if (result) {
        loadDraft();
        loadVersions();
      }
    } catch {
      setError('อ่านไฟล์แผนที่ JSON ไม่สำเร็จ');
    }
  };

  const savePoi = (f: PoiForm, code: string) =>
    act('poi', () =>
      api(`/maps/draft/pois/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: JSON.stringify(f.toBody()),
      }),
      'บันทึก POI แล้ว').then((r) => {
      if (r) setDraft(r as MapFull);
      setEditing(null);
      setForm(null);
    });

  const deletePoi = (code: string) =>
    act(`del-${code}`, () => api(`/maps/draft/pois/${encodeURIComponent(code)}`, { method: 'DELETE' })).then(() =>
      loadDraft(),
    );

  const addKeepout = () => {
    if (!draft || !koName.trim()) return;
    const pts = parsePolygon(koPoints);
    if (!pts) {
      setError('จุด polygon ต้องเป็นตัวเลข "x,y x,y x,y" อย่างน้อย 3 จุด');
      return;
    }
    const next: KeepoutZone[] = [
      ...draft.keepouts,
      { id: 0, name: koName.trim(), polygon: pts },
    ];
    act('keepout', () =>
      api('/maps/draft/keepouts', { method: 'PUT', body: JSON.stringify(next) }),
      'เพิ่มเขตห้ามผ่านแล้ว').then(() => {
      loadDraft();
      setKoName('');
      setKoPoints('0,0 4,0 0,4');
    });
  };

  const deleteKeepout = (id: number) => {
    if (!draft) return;
    const next = draft.keepouts.filter((k) => k.id !== id);
    act(`ko-${id}`, () =>
      api('/maps/draft/keepouts', { method: 'PUT', body: JSON.stringify(next) }),
      'ลบเขตห้ามผ่านแล้ว').then(() => loadDraft());
  };

  const publish = () =>
    act('publish', () => api('/maps/draft/publish', { method: 'POST', body: '{}' })).then(() => {
      setDraft(null);
      loadPublished();
      loadVersions();
    });

  const rollback = (version: number) =>
    act(`rb-${version}`, () => api(`/maps/${version}/rollback`, { method: 'POST', body: '{}' })).then(() => {
      loadPublished();
      loadVersions();
    });

  const startEditPoi = (p: Poi | null) => {
    setEditing(p);
    setForm(
      makePoiForm(
        p
          ? {
              code: p.code,
              nameTh: p.nameTh,
              nameEn: p.nameEn,
              x: String(p.x),
              y: String(p.y),
              headingDeg: p.headingDeg === null ? '' : String(p.headingDeg),
              zone: p.zone ?? '',
              isPublic: p.isPublic,
              isDock: p.isDock,
              sortOrder: String(p.sortOrder),
            }
          : {
              code: '',
              nameTh: '',
              nameEn: '',
              x: '0',
              y: '0',
              headingDeg: '',
              zone: '',
              isPublic: true,
              isDock: false,
              sortOrder: '0',
            },
      ),
    );
  };

  const t = state?.telemetry ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-sans font-semibold text-ink leading-heading">
          แผนที่ {published && <span className="font-mono text-carbon tabular text-base">v{published.version}</span>}
        </h1>
        {published && (
          <span className="text-xs text-ink-3">
            เผยแพร่โดย {published.publishedBy ?? '—'} · {fmtDateTime(published.publishedAt)}
          </span>
        )}
      </div>

      {/* แผนที่ที่เผยแพร่ (CON-06) */}
      <section className="bg-surface border border-line rounded-[3px] p-4">
        {published ? (
          <PlanRenderer
            map={published}
            robot={t ? { x: t.x, y: t.y, headingDeg: t.headingDeg } : null}
          />
        ) : (
          <p className="text-sm text-ink-3">ยังไม่มีแผนที่ที่เผยแพร่</p>
        )}
      </section>

      {/* ฉบับร่าง (admin, CON-09) */}
      {isAdmin && (
        <section className="bg-surface border border-line rounded-[3px] p-4">
          {!draft && (
            <label className="flex flex-col gap-2 mb-4 text-sm text-ink-2">
              <span>นำเข้าแผนที่อาคารจากไฟล์ JSON เพื่อสร้างฉบับร่าง</span>
              <input type="file" accept=".json,application/json" disabled={busy !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importMap(file);
                  event.target.value = '';
                }} className="file-input file-input-bordered w-full max-w-md" />
            </label>
          )}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-2">
              ฉบับร่าง{' '}
              {draft && (
                <span className="font-mono text-carbon tabular">v{draft.version}</span>
              )}
            </h2>
            {draft ? (
              <button
                type="button"
                onClick={() =>
                  window.confirm(`เผยแพร่ v${draft.version} ? เวอร์ชันปัจจุบันจะกลายเป็น archived`) &&
                  publish()
                }
                disabled={busy !== null}
                className="btn btn-primary btn-sm disabled:opacity-60"
              >
                {busy === 'publish' ? 'กำลังเผยแพร่…' : 'เผยแพร่ (CON-09)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => createDraft()}
                disabled={busy !== null || !published}
                className="btn btn-primary btn-sm disabled:opacity-60"
              >
                {busy === 'draft' ? 'กำลังสร้าง…' : 'สร้างร่างจากเวอร์ชันปัจจุบัน'}
              </button>
            )}
          </div>

          {!draft && (
            <p className="text-sm text-ink-3">
              ยังไม่มีฉบับร่าง — สร้างร่างเพื่อแก้ POI / เขตห้ามผ่าน แล้วเผยแพร่เป็นเวอร์ชันใหม่
            </p>
          )}

          {draft && (
            <div className="flex flex-col gap-4">
              {/* POI */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-ink-3">จุดรับ / POI ({draft.pois.length})</h3>
                  <button
                    type="button"
                    onClick={() => startEditPoi(null)}
                    className="btn btn-sm border-line-2"
                  >
                    + เพิ่ม POI
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-3 border-b border-line">
                        <th className="py-2 pr-3 font-medium">รหัส</th>
                        <th className="py-2 pr-3 font-medium">ชื่อ (ไทย)</th>
                        <th className="py-2 pr-3 font-medium">ตำแหน่ง</th>
                        <th className="py-2 pr-3 font-medium">สาธารณะ</th>
                        <th className="py-2 pr-3 font-medium">แท่นชาร์จ</th>
                        <th className="py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.pois.map((p) => (
                        <tr key={p.code} className="border-b border-line">
                          <td className="py-2 pr-3 font-mono tabular">{p.code}</td>
                          <td className="py-2 pr-3">{p.nameTh}</td>
                          <td className="py-2 pr-3 tabular text-ink-2">
                            {p.x.toFixed(1)}, {p.y.toFixed(1)} m
                          </td>
                          <td className="py-2 pr-3">{p.isPublic ? '✓' : '—'}</td>
                          <td className="py-2 pr-3">{p.isDock ? '✓' : '—'}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEditPoi(p)}
                              className="btn btn-xs border-line-2 mr-1"
                            >
                              แก้
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                window.confirm(`ลบ POI ${p.code} (${p.nameTh}) ?`) && deletePoi(p.code)
                              }
                              disabled={busy !== null}
                              className="btn btn-xs btn-error border-transparent"
                            >
                              ลบ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* keepouts */}
              <div>
                <h3 className="text-xs font-semibold text-ink-3 mb-2">
                  เขตห้ามผ่าน (keepouts: {draft.keepouts.length})
                </h3>
                <ul className="flex flex-wrap gap-2 mb-2">
                  {draft.keepouts.length === 0 && (
                    <li className="text-sm text-ink-3">ยังไม่มีเขตห้ามผ่าน</li>
                  )}
                  {draft.keepouts.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center gap-2 bg-surface-2 border border-line rounded-[3px] px-2 py-1 text-sm"
                    >
                      {k.name}
                      <button
                        type="button"
                        onClick={() => deleteKeepout(k.id)}
                        disabled={busy !== null}
                        className="text-red hover:underline disabled:opacity-50"
                        aria-label={`ลบ ${k.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={koName}
                    onChange={(e) => setKoName(e.target.value)}
                    placeholder="ชื่อเขต (เช่น โซนก่อสร้าง)"
                    className="input input-bordered w-full sm:w-56 bg-surface text-sm"
                    aria-label="ชื่อเขตห้ามผ่าน"
                  />
                  <input
                    value={koPoints}
                    onChange={(e) => setKoPoints(e.target.value)}
                    placeholder="จุด polygon: x,y x,y x,y"
                    className="input input-bordered w-full sm:flex-1 bg-surface text-sm font-mono"
                    aria-label="จุด polygon ของเขตห้ามผ่าน"
                  />
                  <button
                    type="button"
                    onClick={() => addKeepout()}
                    disabled={busy !== null || !koName.trim()}
                    className="btn btn-sm border-line-2 disabled:opacity-60"
                  >
                    + เพิ่มเขต
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ประวัติเวอร์ชัน (CON-09) */}
      <section className="bg-surface border border-line rounded-[3px] p-4">
        <h2 className="text-sm font-semibold text-ink-2 mb-3">ประวัติเวอร์ชัน</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 border-b border-line">
              <th className="py-2 pr-3 font-medium">เวอร์ชัน</th>
              <th className="py-2 pr-3 font-medium">สถานะ</th>
              <th className="py-2 pr-3 font-medium">ชื่อ</th>
              <th className="py-2 pr-3 font-medium">เผยแพร่โดย</th>
              <th className="py-2 pr-3 font-medium">เผยแพร่เมื่อ</th>
              {isAdmin && <th className="py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version} className="border-b border-line">
                <td className="py-2 pr-3 font-mono tabular">{v.version}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`badge border-transparent ${
                      v.status === 'published'
                        ? 'bg-green-bg text-green'
                        : v.status === 'draft'
                          ? 'bg-amber-bg text-amber'
                          : 'bg-surface-3 text-ink-2'
                    }`}
                  >
                    {v.status === 'published' ? 'เผยแพร่' : v.status === 'draft' ? 'ร่าง' : 'archived'}
                  </span>
                </td>
                <td className="py-2 pr-3">{v.name}</td>
                <td className="py-2 pr-3 text-ink-2">{v.publishedBy ?? '—'}</td>
                <td className="py-2 pr-3 text-ink-2 tabular">{fmtDateTime(v.publishedAt)}</td>
                {isAdmin && (
                  <td className="py-2 text-right">
                    {v.status !== 'published' && (
                      <button
                        type="button"
                        onClick={() =>
                          window.confirm(`ย้อนกลับเป็น v${v.version} ?`) && rollback(v.version)
                        }
                        disabled={busy !== null}
                        className="btn btn-xs border-line-2 disabled:opacity-60"
                      >
                        ย้อนกลับ (rollback)
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* POI form */}
      {form && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-surface border border-line rounded-[3px] w-full max-w-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink">
                {editing ? `แก้ POI ${editing.code}` : 'เพิ่ม POI ใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
                className="btn btn-sm border-line-2"
              >
                ปิด
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <PoiField label="รหัส (code)">
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={!!editing}
                  placeholder="เช่น 104"
                  className="input input-bordered w-full bg-surface font-mono disabled:opacity-50"
                />
              </PoiField>
              <PoiField label="ชื่อไทย">
                <input
                  value={form.nameTh}
                  onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
                  className="input input-bordered w-full bg-surface"
                />
              </PoiField>
              <PoiField label="ชื่ออังกฤษ">
                <input
                  value={form.nameEn}
                  onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                  className="input input-bordered w-full bg-surface"
                />
              </PoiField>
              <PoiField label="โซน (zone)">
                <input
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  className="input input-bordered w-full bg-surface"
                />
              </PoiField>
              <PoiField label="x (m)">
                <input
                  value={form.x}
                  onChange={(e) => setForm({ ...form, x: e.target.value })}
                  inputMode="decimal"
                  className="input input-bordered w-full bg-surface font-mono"
                />
              </PoiField>
              <PoiField label="y (m)">
                <input
                  value={form.y}
                  onChange={(e) => setForm({ ...form, y: e.target.value })}
                  inputMode="decimal"
                  className="input input-bordered w-full bg-surface font-mono"
                />
              </PoiField>
              <PoiField label="มุม (องศา, 0–360)">
                <input
                  value={form.headingDeg}
                  onChange={(e) => setForm({ ...form, headingDeg: e.target.value })}
                  inputMode="decimal"
                  placeholder="— (ไม่กำหนด)"
                  className="input input-bordered w-full bg-surface font-mono"
                />
              </PoiField>
              <PoiField label="ลำดับ (sortOrder)">
                <input
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  inputMode="numeric"
                  className="input input-bordered w-full bg-surface font-mono"
                />
              </PoiField>
              <label className="flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                />
                สาธารณะ — ปรากฏในจอหุ่น (isPublic)
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={form.isDock}
                  onChange={(e) => setForm({ ...form, isDock: e.target.checked })}
                />
                เป็นแท่นชาร์จ (isDock)
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
                className="btn border-line-2"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => form && savePoi(form, editing ? editing.code : form.code.trim())}
                disabled={busy !== null || !form.code.trim() || !form.nameTh.trim() || !form.nameEn.trim()}
                className="btn btn-primary disabled:opacity-60"
              >
                {busy === 'poi' ? 'กำลังบันทึก…' : 'บันทึก POI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* แจ้งเตือน */}
      {(error || notice) && (
        <div
          role="alert"
          className={`text-sm px-3 py-2 rounded-[3px] ${
            error ? 'bg-red-bg text-red' : 'bg-green-bg text-green'
          }`}
        >
          {error ?? notice}
        </div>
      )}
    </div>
  );
}

interface PoiForm {
  code: string;
  nameTh: string;
  nameEn: string;
  x: string;
  y: string;
  headingDeg: string;
  zone: string;
  isPublic: boolean;
  isDock: boolean;
  sortOrder: string;
  toBody(): Record<string, unknown>;
}

/** สร้าง body ตาม poiUpsertSchema — headingDeg/zone ว่าง = null */
function makePoiForm(f: Omit<PoiForm, 'toBody'>): PoiForm {
  return {
    ...f,
    toBody() {
      return {
        code: f.code.trim(),
        nameTh: f.nameTh.trim(),
        nameEn: f.nameEn.trim(),
        x: Number(f.x),
        y: Number(f.y),
        headingDeg: f.headingDeg.trim() === '' ? null : Number(f.headingDeg),
        zone: f.zone.trim() === '' ? null : f.zone.trim(),
        isPublic: f.isPublic,
        isDock: f.isDock,
        sortOrder: Number(f.sortOrder) || 0,
      };
    },
  };
}

/** "0,0 4,0 0,4" → [[0,0],[4,0],[0,4]] — null ถ้าไม่ถูกต้อง */
function parsePolygon(s: string): [number, number][] | null {
  const pts = s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (pts.length < 6 || pts.length % 2 !== 0 || pts.some((n) => !Number.isFinite(n))) return null;
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  return out;
}

function PoiField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-3">{label}</span>
      {children}
    </label>
  );
}
