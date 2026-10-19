'use client';

import { useEffect, useState } from 'react';
import type { AiConversation, AiRejection } from '@hermes/shared';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import { ReceptionMonitor } from '../../../components/ReceptionMonitor';

/**
 * AI (Phase 2 — Qwen บน Jetson) — spec §8.7
 * Local Phase 2 demo: status + live rejection/conversation log.
 */
export default function AiPage() {
  const [rejections, setRejections] = useState<AiRejection[] | null>(null);
  const [conversations, setConversations] = useState<AiConversation[] | null>(null);
  const [status, setStatus] = useState<{ mode: 'off' | 'local'; simulated: boolean; model: string | null; modelReady: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      api<AiRejection[]>('/ai/rejections').then((items) => { if (live) setRejections(items); }).catch(() => {});
      api<AiConversation[]>('/ai/conversations').then((items) => { if (live) setConversations(items); }).catch(() => {});
      api<{ mode: 'off' | 'local'; simulated: boolean; model: string | null; modelReady: boolean }>('/ai/status')
        .then((next) => { if (live) setStatus(next); }).catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  const demoReady = status?.mode === 'local' && status.modelReady;

  return (
    <div className="flex flex-col gap-4">
      <ReceptionMonitor />
      <div>
        <h1 className="font-sans font-semibold text-ink leading-heading">AI local · สถานะและประวัติ</h1>
        <p className="text-sm text-ink-2 mt-1">
          ดูสถานะโมเดลและประวัติคำขอจากเว็บผู้ช่วย AI
        </p>
      </div>

      <section className={`${demoReady ? 'bg-green-bg border-green' : 'bg-amber-bg border-amber'} border rounded-[3px] p-4 text-sm text-ink`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`badge ${demoReady ? 'bg-green' : 'bg-amber'} text-white border-transparent`}>
            {demoReady ? 'ทดลองบนเครื่อง' : 'ยังไม่เปิดใช้งาน'}
          </span>
          <span className="font-semibold">{demoReady ? status.model : 'กำลังรอโมเดล local'}</span>
        </div>
        <p className="text-ink-2 leading-body">
          {demoReady
            ? `โมเดลในเครื่องเชื่อมกับ${status.simulated ? 'หุ่นจำลอง' : 'หุ่นจริง'} · เลือกจุดหมายจาก POI บนหุ่น · ระบบเสียงยังไม่เปิดใช้งาน`
            : 'เปิดโมเดลในเครื่องและตั้ง AI_MODE=local เพื่อรับคำสั่งข้อความ'}
        </p>
      </section>

      <a href="http://localhost:3001/ai" target="_blank" rel="noopener noreferrer" className="btn btn-primary self-start">เปิดเว็บผู้ช่วย AI ↗</a>

      <section className="bg-surface border border-line rounded-[3px] p-4">
        <h2 className="text-sm font-semibold text-ink-2 mb-3">
          คำสั่งที่ถูกปฏิเสธ (rejections) — {rejections ? rejections.length : '…'} รายการ
        </h2>
        {rejections ? (
          rejections.length === 0 ? (
            <p className="text-sm text-ink-3">ยังไม่มีคำสั่งที่ถูกปฏิเสธ</p>
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
            <p className="text-sm text-ink-3">ยังไม่มีบทสนทนา</p>
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
