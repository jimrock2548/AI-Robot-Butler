import type { LinkStatus } from '@hermes/shared';
import { fmtAgeMs } from '../lib/format';

/**
 * ป้ายสถานะลิงก์ (spec §5.3):
 * ok → เขียว / stale → อำพัน + "ค่าเมื่อ N วิที่แล้ว" / dead → เทา + "ลิงก์ขาด"
 */
export function LinkStatusBadge({
  linkStatus,
  lastSeenAt,
  nowMs,
}: {
  linkStatus: LinkStatus | undefined;
  lastSeenAt: string | null | undefined;
  nowMs: number;
}) {
  if (!linkStatus) {
    return (
      <span className="badge bg-surface-3 border-line-2 text-ink-2">กำลังเชื่อมต่อ…</span>
    );
  }
  if (linkStatus === 'ok') {
    return (
      <span className="badge bg-green-bg text-green border-transparent">
        ● ออนไลน์
      </span>
    );
  }
  if (linkStatus === 'stale') {
    const age = lastSeenAt ? nowMs - new Date(lastSeenAt).getTime() : 0;
    return (
      <span className="badge bg-amber-bg text-amber border-transparent">
        ◐ สัญญาณอ่อน — ค่าเมื่อ {fmtAgeMs(age)}
      </span>
    );
  }
  return (
    <span className="badge bg-surface-3 text-ink-3 border-transparent line-through">
      ○ ลิงก์ขาด
    </span>
  );
}
