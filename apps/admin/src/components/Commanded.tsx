/**
 * ค่าที่ "คอนโซลสั่ง" — navy, Archivo 600 (spec §4.2 กฎสองสีหมึก)
 * ห้ามใช้กับค่าที่หุ่นรายงาน (ใช้ <Reported /> แทน)
 */
export function Commanded({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-sans font-semibold text-navy tabular ${className}`}>
      {children}
    </span>
  );
}
