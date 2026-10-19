import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** memory = ข้อมูลในหน่วยความจำ + หุ่นจำลอง (ไม่ต้องการ PostgreSQL) */
  dbMode: (process.env.ROBOT_MODE === 'mock' ? 'memory' : process.env.DB_MODE ?? 'memory') as 'memory' | 'pg',
  robotMode: (process.env.ROBOT_MODE ?? (process.env.DB_MODE === 'pg' ? 'hermes' : 'sim')) as 'sim' | 'hermes' | 'mock',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://hermes:hermes@localhost:5432/hermes',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-secret-change-me',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  robot: {
    code: process.env.ROBOT_CODE ?? 'HX-01',
    baseUrl: process.env.HERMES_BASE_URL ?? 'http://192.168.1.50:1448',
    /** Real hardware starts with GET-only access until movement is explicitly enabled. */
    readOnly: process.env.ROBOT_MODE === 'mock' ? false : process.env.HERMES_READ_ONLY !== 'false',
    maxLinearMps: Math.min(0.2, Math.max(0.01, Number(process.env.HERMES_MAX_LINEAR_MPS ?? 0.1))),
    maxAngularRps: Math.min(0.5, Math.max(0.05, Number(process.env.HERMES_MAX_ANGULAR_RPS ?? 0.3))),
    minLocalizationQuality: 50,
  },
  kioskToken: process.env.KIOSK_TOKEN ?? 'dev-kiosk-token',
  ai: {
    navigationOnly: process.env.AI_NAVIGATION_ONLY !== 'false',
    mode: (process.env.AI_MODE ?? 'off') as 'off' | 'local',
    baseUrl: process.env.AI_BASE_URL ?? 'http://127.0.0.1:8080',
    model: process.env.AI_MODEL ?? 'qwen3.5-2b',
    minConfidence: Number(process.env.AI_MIN_CONFIDENCE ?? 0.8),
    searxngUrl: process.env.SEARXNG_URL ?? 'http://127.0.0.1:8888',
  },
  telemetry: {
    /** poll Hermes ทุก 500 ms (spec §5.1) */
    pollMs: 500,
    /** broadcast ผ่าน Socket.IO ทุก 1000 ms (spec §5.1) */
    broadcastMs: 500,
    /** NFR-08: stale 2–5 วิ, dead > 5 วิ (spec §5.3) */
    staleMs: 2000,
    deadMs: 5000,
  },
  lock: {
    /** TTL 30 วินาที ต่ออายุด้วย heartbeat ทุก 10 วินาที (spec §6.2) */
    ttlMs: 30_000,
  },
  dock: {
    enabled: process.env.ROBOT_MODE !== 'mock' && process.env.HERMES_AUTO_DOCK === 'true',
    /** แบตต่ำกว่าเกณฑ์ → กลับแท่นชาร์จอัตโนมัติ (CON-05) */
    autoDockBatteryPct: 15,
  },
} as const;
