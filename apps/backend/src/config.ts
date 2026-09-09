export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** memory = ข้อมูลในหน่วยความจำ + หุ่นจำลอง (ไม่ต้องการ PostgreSQL) */
  dbMode: (process.env.DB_MODE ?? 'memory') as 'memory' | 'pg',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://hermes:hermes@localhost:5432/hermes',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-secret-change-me',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  robot: {
    code: process.env.ROBOT_CODE ?? 'HX-01',
    baseUrl: process.env.HERMES_BASE_URL ?? 'http://192.168.1.50:1448',
  },
  kioskToken: process.env.KIOSK_TOKEN ?? 'dev-kiosk-token',
  telemetry: {
    /** poll Hermes ทุก 500 ms (spec §5.1) */
    pollMs: 500,
    /** broadcast ผ่าน Socket.IO ทุก 1000 ms (spec §5.1) */
    broadcastMs: 1000,
    /** NFR-08: stale 2–5 วิ, dead > 5 วิ (spec §5.3) */
    staleMs: 2000,
    deadMs: 5000,
  },
  lock: {
    /** TTL 30 วินาที ต่ออายุด้วย heartbeat ทุก 10 วินาที (spec §6.2) */
    ttlMs: 30_000,
  },
  dock: {
    /** แบตต่ำกว่าเกณฑ์ → กลับแท่นชาร์จอัตโนมัติ (CON-05) */
    autoDockBatteryPct: 15,
  },
} as const;
