/**
 * การแสดงผลตัวเลข/วันที่ ตามหลัก spec §12:
 * - วันที่เวลาเป็นไทย พ.ศ. (หลักข้อ 9)
 * - ch ห้ามใช้เป็นหน่วยวัด (ใช้ em/% แทน)
 */

const buddhistDate = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const buddhistDateTime = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const buddhistClock = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return buddhistDate.format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return buddhistDateTime.format(new Date(iso));
}

export function fmtClock(now: Date): string {
  return buddhistClock.format(now);
}

/** "3 วิที่แล้ว" — อายุของค่า telemetry (NFR-02) */
export function fmtAgeMs(ms: number): string {
  if (ms < 1000) return 'สด ๆ';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} วิที่แล้ว`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  return `${Math.floor(min / 60)} ชม.ที่แล้ว`;
}

/** uptime → "3 ชม. 12 นาที" */
export function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0) return `${m} นาที`;
  return `${sec} วิ`;
}

/** มุม → ทิศ (ไทย) */
export function headingToCompass(deg: number): string {
  const dirs = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

export function fmtDurationSec(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec} วิ`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} นาที ${s} วิ` : `${m} นาที`;
}
