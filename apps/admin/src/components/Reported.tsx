import type { LinkStatus } from '@hermes/shared';

/**
 * ค่าที่ "หุ่นรายงานกลับ" — carbon, Courier Prime 700, tabular numbers (spec §4.2)
 * stale → สีอำพัน / dead → ขีดฆ่า (spec §5.3 ห้ามโชว์ค่าเก่าเป็นค่าสด)
 */
export function Reported({
  children,
  linkStatus,
  className = '',
}: {
  children: React.ReactNode;
  linkStatus?: LinkStatus;
  className?: string;
}) {
  const tone =
    linkStatus === 'dead' ? 'value-dead' : linkStatus === 'stale' ? 'value-stale' : '';
  return (
    <span
      className={`font-mono font-bold text-carbon tabular ${tone} ${className}`}
    >
      {children}
    </span>
  );
}
