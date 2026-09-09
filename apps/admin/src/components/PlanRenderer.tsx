import type { MapFull, Poi } from '@hermes/shared';

/**
 * แผนที่ SLAM แบบ SVG — ใช้ทั้งในแดชบอร์ด / หน้าแผนที่ / ควบคุม
 * พิกัด: x → ขวา, y → เหนือ (กลับแนว y ตอนวาดเป็น SVG)
 */
export interface PlanRendererProps {
  map: MapFull;
  robot?: { x: number; y: number; headingDeg: number } | null;
  routeTo?: Poi | null;
  highlightPoiCode?: string | null;
  /** true = แสดงเฉพาะ POI ที่ public (มุมมองจอหุ่น) */
  publicOnly?: boolean;
  className?: string;
}

export function PlanRenderer({
  map,
  robot,
  routeTo,
  highlightPoiCode,
  publicOnly = false,
  className = '',
}: PlanRendererProps) {
  const W = map.widthM;
  const H = map.heightM;
  const flipY = (y: number) => H - y;

  const pois = publicOnly ? map.pois.filter((p) => p.isPublic) : map.pois;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full h-auto bg-surface-2 border border-line rounded-[3px] ${className}`}
      role="img"
      aria-label={`แผนที่ ${map.name}`}
    >
      <defs>
        <pattern id="keepout-hatch" width="0.8" height="0.8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="0.8" height="0.8" fill="#C0182C" opacity="0.07" />
          <line x1="0" y1="0" x2="0" y2="0.8" stroke="#C0182C" strokeWidth="0.12" opacity="0.4" />
        </pattern>
      </defs>

      {/* กริด 5 m */}
      {Array.from({ length: Math.floor(W / 5) }, (_, i) => (i + 1) * 5).map((x) => (
        <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={H} stroke="#E1E5EB" strokeWidth={0.08} />
      ))}
      {Array.from({ length: Math.floor(H / 5) }, (_, i) => (i + 1) * 5).map((y) => (
        <line key={`gy${y}`} x1={0} y1={y} x2={W} y2={y} stroke="#E1E5EB" strokeWidth={0.08} />
      ))}

      {/* ห้อง / โซน */}
      {map.rooms.map((r) => (
        <g key={r.id}>
          <rect
            x={r.x}
            y={flipY(r.y + r.h)}
            width={r.w}
            height={r.h}
            fill={r.kind === 'lobby' ? '#EEF1F5' : '#F7F9FB'}
            stroke="#CBD2DC"
            strokeWidth={0.12}
          />
          {(r.nameTh || r.nameEn) && (
            <text
              x={r.x + 0.4}
              y={flipY(r.y + r.h) + 0.9}
              fontSize={0.75}
              fill="#5F6B7D"
            >
              {r.nameTh ?? r.nameEn}
            </text>
          )}
        </g>
      ))}

      {/* โซนห้ามเข้า (แดง = ห้าม/อันตราย เท่านั้น) */}
      {map.keepouts.map((k) => (
        <g key={k.id}>
          <polygon
            points={k.polygon.map(([px, py]) => `${px},${flipY(py)}`).join(' ')}
            fill="url(#keepout-hatch)"
            stroke="#C0182C"
            strokeWidth={0.12}
            strokeDasharray="0.5 0.3"
          />
          <text
            x={k.polygon[0]?.[0] ?? 0}
            y={flipY(k.polygon[0]?.[1] ?? 0) - 0.3}
            fontSize={0.6}
            fill="#C0182C"
          >
            {k.name}
          </text>
        </g>
      ))}

      {/* เส้นทางไปเป้าหมาย (เส้นประ) */}
      {robot && routeTo && (
        <line
          x1={robot.x}
          y1={flipY(robot.y)}
          x2={routeTo.x}
          y2={flipY(routeTo.y)}
          stroke="#12285A"
          strokeWidth={0.18}
          strokeDasharray="0.7 0.5"
          opacity={0.7}
        />
      )}

      {/* POIs */}
      {pois.map((p) => {
        const highlighted = p.code === highlightPoiCode;
        const isDock = p.isDock;
        const fill = isDock ? '#157347' : p.isPublic ? '#12285A' : '#8A5A00';
        return (
          <g key={p.code}>
            <circle
              cx={p.x}
              cy={flipY(p.y)}
              r={highlighted ? 0.75 : 0.55}
              fill={fill}
              opacity={p.isPublic || isDock ? 1 : 0.55}
              stroke={highlighted ? '#12285A' : 'none'}
              strokeWidth={highlighted ? 0.18 : 0}
            />
            <text
              x={p.x}
              y={flipY(p.y) - 0.85}
              fontSize={0.72}
              textAnchor="middle"
              fill={fill}
              fontWeight={highlighted ? 700 : 500}
            >
              {p.nameTh}
            </text>
          </g>
        );
      })}

      {/* หุ่น — จุด + ทิศ (heading) */}
      {robot && (
        <g transform={`translate(${robot.x}, ${flipY(robot.y)}) rotate(${robot.headingDeg})`}>
          <circle r={0.6} fill="#12285A" stroke="#FFFFFF" strokeWidth={0.12} />
          <line x1={0} y1={0} x2={0} y2={-0.95} stroke="#12285A" strokeWidth={0.22} />
          <polygon points="0,-1.35 0.28,-0.9 -0.28,-0.9" fill="#12285A" />
        </g>
      )}

      {/* สเกล */}
      <g transform={`translate(0.5, ${H - 0.6})`}>
        <line x1={0} y1={0} x2={5} y2={0} stroke="#5F6B7D" strokeWidth={0.1} />
        <line x1={0} y1={-0.2} x2={0} y2={0.2} stroke="#5F6B7D" strokeWidth={0.1} />
        <line x1={5} y1={-0.2} x2={5} y2={0.2} stroke="#5F6B7D" strokeWidth={0.1} />
        <text x={2.5} y={-0.25} fontSize={0.55} textAnchor="middle" fill="#5F6B7D">
          5 m
        </text>
      </g>
    </svg>
  );
}
