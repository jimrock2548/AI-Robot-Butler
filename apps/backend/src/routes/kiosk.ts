import { Router } from 'express';
import { kioskEscortSchema } from '@hermes/shared';
import type { JobSummary, KioskDestination, KioskSession } from '@hermes/shared';
import { requireKioskToken } from '../middleware/kioskToken';
import { createJob, cancelJob } from '../services/jobService';
import { jobSummary } from '../services/robotService';
import { buildTelemetry } from '../services/robotService';
import { getWorld } from '../db/memory';
import { handleKioskIntent } from '../services/aiService';
import { streamKioskChat } from '../services/chatService';
import { config } from '../config';

/**
 * Kiosk (จอบนตัวหุ่น) — device token, จำกัด 4 endpoint (spec §8.6)
 */
export const kioskRouter = Router();
kioskRouter.use(requireKioskToken);

kioskRouter.get('/ai-status', async (_req, res) => {
  let webReady = false;
  try {
    const health = await fetch(new URL('/healthz', config.ai.searxngUrl), { signal: AbortSignal.timeout(1500) });
    webReady = health.ok;
  } catch { /* SearXNG ยังไม่เปิด */ }
  res.json({ textReady: config.ai.mode === 'local' && config.robotMode === 'sim', voiceReady: false, webReady, simulated: config.robotMode === 'sim' });
});

kioskRouter.post('/chat', async (req, res, next) => {
  if (config.ai.mode !== 'local' || config.robotMode !== 'sim') {
    res.status(503).json({ error: { code: 'ai_unavailable', message: 'ระบบสนทนายังไม่พร้อมใช้งาน' } });
    return;
  }
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.flushHeaders();
    await streamKioskChat(req.body, (event) => {
      if (!controller.signal.aborted) res.write(`${JSON.stringify(event)}\n`);
    }, controller.signal);
    if (!controller.signal.aborted) res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    if (res.headersSent) {
      res.write(`${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'ตอบคำถามไม่สำเร็จ' })}\n`);
      res.end();
    } else next(error);
  }
});

// Voice/STT will be connected after the local text path is verified.
kioskRouter.post('/voice', (_req, res) => {
  res.status(501).json({
    error: { code: 'ai_unavailable', message: 'ระบบสนทนาด้วยเสียงยังไม่พร้อมใช้งาน' },
  });
});

kioskRouter.post('/intent', async (req, res, next) => {
  const requestController = new AbortController();
  res.on('close', () => { if (!res.writableEnded) requestController.abort(); });
  try {
    if (config.ai.mode !== 'local') {
      res.status(501).json({ error: { code: 'ai_unavailable', message: 'ระบบ AI ยังไม่พร้อมใช้งาน' } });
      return;
    }
    if (config.robotMode !== 'sim') {
      res.status(503).json({ error: { code: 'ai_sim_only', message: 'AI รุ่นทดลองใช้ได้กับหุ่นจำลองเท่านั้น' } });
      return;
    }
    res.json(await handleKioskIntent(req.body, undefined, requestController.signal));
  } catch (error) {
    if (!res.destroyed) next(error);
  }
});

const KIOSK_REQUESTER = { id: null, name: 'จอหุ่น (Kiosk)' };
const KIOSK_CANCELLER = { id: null, displayName: 'จอหุ่น (Kiosk)' };

/** GET /api/kiosk/destinations — เฉพาะ POI ที่ is_public = true (RBT-01) */
kioskRouter.get('/destinations', (req, res, next) => {
  try {
    const items: KioskDestination[] = getWorld()
      .publishedPois()
      .filter((p) => p.isPublic)
      .sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
    res.json({ lang: req.query.lang === 'en' ? 'en' : 'th', items });
  } catch (e) {
    next(e);
  }
});

/** POST /api/kiosk/escort — สร้าง job source='kiosk_touch' (RBT-04) */
kioskRouter.post('/escort', async (req, res, next) => {
  try {
    const { destPoiCode } = kioskEscortSchema.parse(req.body);
    const job = await createJob(destPoiCode, 'kiosk_touch', KIOSK_REQUESTER, { requirePublic: true });
    res.status(201).json(job);
  } catch (e) {
    next(e);
  }
});

/** GET /api/kiosk/session/:jobId — ความคืบหน้าสำหรับหน้าจอนำทาง */
kioskRouter.get('/session/:jobId', (req, res, next) => {
  try {
    const job = getWorld().jobs.find((j) => j.id === Number(req.params.jobId));
    if (!job || !['kiosk_touch', 'kiosk_voice'].includes(job.source)) {
      res.status(404).json({ error: { code: 'not_found', message: 'ไม่พบงานนี้' } });
      return;
    }
    const w = getWorld();
    const map = w.maps.find((m) => m.version === job.mapVersion);
    const telemetry = buildTelemetry();
    const summary: JobSummary = jobSummary(job);
    const session: KioskSession = {
      job: summary,
      lang: req.query.lang === 'en' ? 'en' : 'th',
      map: map ? {
        widthM: map.widthM,
        heightM: map.heightM,
        rooms: map.rooms,
        pois: w.mapPois(map.id).filter((p) => p.isPublic).map((p) => ({
          code: p.code, nameTh: p.nameTh, nameEn: p.nameEn, x: p.x, y: p.y,
          headingDeg: p.headingDeg, zone: p.zone, isPublic: p.isPublic,
          isDock: p.isDock, sortOrder: p.sortOrder,
        })),
        keepouts: w.keepouts.filter((k) => k.mapId === map.id),
      } : null,
      robot: telemetry ? { x: telemetry.x, y: telemetry.y, headingDeg: telemetry.headingDeg } : null,
    };
    res.json(session);
  } catch (e) {
    next(e);
  }
});

/** POST /api/kiosk/cancel — ผู้มาเยือนกดปุ่มหยุด (RBT-06) */
kioskRouter.post('/cancel', async (req, res, next) => {
  try {
    const w = getWorld();
    const job = w.activeJob();
    if (!job || !['kiosk_touch', 'kiosk_voice'].includes(job.source)) {
      res.json({ job: null });
      return;
    }
    // cancelJob() คืนค่า JobSummary มาแล้ว (ไม่ต้องผ่าน jobSummary() ซ้ำ)
    const summary: JobSummary = await cancelJob(job.id, KIOSK_CANCELLER, 'ยกเลิกจากจอหุ่น');
    res.json({ job: summary });
  } catch (e) {
    next(e);
  }
});
