'use client';

import { useEffect, useState } from 'react';
import type { AiConversation, AiRejection } from '@hermes/shared';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';

/**
 * AI (Phase 2 — Qwen บน Jetson) — spec §8.7
 * Phase 1: contract พร้อมแล้ว, POST /ai/intent คืน 501
 * หน้านี้แสดงสถานะ + log rejections / conversations (ว่างใน Phase 1)
 */
export default function AiPage() {
  const [rejections, setRejections] = useState<AiRejection[] | null>(null);
  const [conversations, setConversations] = useState<AiConversation[] | null>(null);

  useEffect(() => {
    api<AiRejection[]>('/ai/rejections').then(setRejections).catch(() => {});
    api<AiConversation[]>('/ai/conversations').then(setConversations).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-sans font-semibold text-ink leading-heading">AI (Phase 2)</h1>
        <p className="text-sm text-ink-2 mt-1">
          ระบบสั่งงานด้วยเสียงจะเชื่อมต่อ Qwen บน Jetson ใน Phase 2
        </p>
      </div>

      <section className="bg-amber-bg border border-amber rounded-[3px] p-4 text-sm text-ink">
        <div className="flex items-center gap-2 mb-1">
          <span className="badge bg-amber text-white border-transparent">ยังไม่เชื่อมต่อ</span>
          <span className="font-semibold">POST /api/ai/intent → 501 not_implemented</span>
        </div>
        <p className="text-ink-2 leading-body">
          Contract ตาม spec §8.7 พร้อมแล้ว — เมื่อ Phase 2 เชื่อม Qwen เสร็จ ระบบจะจำแนก intent
          (ไปจุด / สถานะ / ยกเลิก) และบันทึกทุกบทสนทนา + ทุกคำสั่งที่ถูกปฏิเสธไว้ที่หน้านี้
        </p>
      </section>

      <section className="bg-surface border border-line rounded-[3px] p-4">
        <h2 className="text-sm font-semibold text-ink-2 mb-3">
          คำสั่งที่ถูกปฏิเสธ (rejections) — {rejections ? rejections.length : '…'} รายการ
        </h2>
        {rejections ? (
          rejections.length === 0 ? (
            <p className="text-sm text-ink-3">ยังไม่มีการปฏิเสธคำสั่ง (Phase 1 — AI ยังไม่ทำงาน)</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3 border-b border-line">
                  <th className="py-2 pr-3 font-medium">เมื่อ</th>
                  <th className="py-2 pr-3 font-medium">ข้อความที่พูด</th>
                  <th className="py-2 font-medium">เหตุผล</th>
                </tr>
              </thead>
              <tbody>
                {rejections.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="py-2 pr-3 tabular text-ink-2">{fmtDateTime(r.at)}</td>
                    <td className="py-2 pr-3">“{r.transcript}”</td>
                    <td className="py-2 text-red">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <p className="text-sm text-ink-3">กำลังโหลด…</p>
        )}
      </section>

      <section className="bg-surface border border-line rounded-[3px] p-4">
        <h2 className="text-sm font-semibold text-ink-2 mb-3">
          บทสนทนา (conversations) — {conversations ? conversations.length : '…'} รายการ
        </h2>
        {conversations ? (
          conversations.length === 0 ? (
            <p className="text-sm text-ink-3">ยังไม่มีบทสนทนา (Phase 1 — AI ยังไม่ทำงาน)</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3 border-b border-line">
                  <th className="py-2 pr-3 font-medium">เมื่อ</th>
                  <th className="py-2 pr-3 font-medium">ภาษา</th>
                  <th className="py-2 pr-3 font-medium">ข้อความ</th>
                  <th className="py-2 pr-3 font-medium">Intent</th>
                  <th className="py-2 pr-3 font-medium">ความมั่นใจ</th>
                  <th className="py-2 pr-3 font-medium">Job</th>
                  <th className="py-2 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr key={c.id} className="border-b border-line">
                    <td className="py-2 pr-3 tabular text-ink-2">{fmtDateTime(c.at)}</td>
                    <td className="py-2 pr-3 uppercase">{c.lang}</td>
                    <td className="py-2 pr-3">“{c.transcript}”</td>
                    <td className="py-2 pr-3">{c.intent ?? '—'}</td>
                    <td className="py-2 pr-3 tabular">
                      {c.confidence === null ? '—' : `${Math.round(c.confidence * 100)}%`}
                    </td>
                    <td className="py-2 pr-3 font-mono tabular">{c.jobId ?? '—'}</td>
                    <td className="py-2 tabular">{c.latencyMs === null ? '—' : `${c.latencyMs} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <p className="text-sm text-ink-3">กำลังโหลด…</p>
        )}
      </section>
    </div>
  );
}
