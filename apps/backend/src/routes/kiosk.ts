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
import { hermes } from '../hermes/driver';
import { getLiveMap } from '../services/liveMapService';
import { handleRobotAiCommand } from '../services/robotAiService';
import { z } from 'zod';
import { ApiError } from '../errors';
import { createReception, authorizeReception, publicSession, appendMessage, saveReception, beginReceptionTurn, finishReceptionTurn, receptionEvents } from '../services/receptionService';

/**
 * Kiosk (จอบนตัวหุ่น) — device token, จำกัด 4 endpoint (spec §8.6)
 */
export const kioskRouter = Router();
kioskRouter.use(requireKioskToken);

kioskRouter.post('/conversation', async (_req, res, next) => {
  try { res.status(201).json(await createReception()); } catch (error) { next(error); }
});
kioskRouter.get('/conversation/:id', async (req, res, next) => {
  try {
    const session = await authorizeReception(z.string().uuid().parse(req.params.id), req.header('x-conversation-token') ?? '');
    res.setHeader('Cache-Control', 'no-store');
    res.json(publicSession(session));
  } catch (error) { next(error); }
});

kioskRouter.post('/conversation/:id/messages', async (req, res, next) => {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  let session: Awaited<ReturnType<typeof authorizeReception>> | undefined;
  let started = false;
  try {
    const body = z.object({ content: z.string().trim().min(1).max(500), lang: z.enum(['th', 'en']) }).parse(req.body);
    session = await authorizeReception(z.string().uuid().parse(req.params.id), req.header('x-conversation-token') ?? '');
    if (session.messages.length > 197) throw new ApiError(409, 'conversation_full', 'กรุณาเริ่มบทสนทนาใหม่');
    beginReceptionTurn(session.id, controller); started = true;
    appendMessage(session, 'user', body.content);
    await saveReception(session);
    res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform' });
    res.flushHeaders();
    res.write(`${JSON.stringify({ type: 'session', session: publicSession(session) })}\n`);
    if (session.mode === 'staff') {
      res.end(`${JSON.stringify({ type: 'done' })}\n`);
      return;
    }
    const answer = appendMessage(session, 'assistant', '');
    answer.status = 'streaming';
    const history = session.messages.filter(m => m.role !== 'staff' && m.content.trim()).slice(-8)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 500) }));
    try {
      await streamKioskChat({ messages: history, lang: body.lang }, event => {
        if (controller.signal.aborted || session!.mode !== 'ai') return;
        if (event.type === 'delta') {
          answer.content += event.text;
          session!.revision++;
          receptionEvents.emit('update', publicSession(session!));
          if (!res.destroyed) res.write(`${JSON.stringify({ type: 'session', session: publicSession(session!) })}\n`);
        }
        if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`);
      }, controller.signal);
      answer.status = controller.signal.aborted ? 'cancelled' : 'complete';
    } catch (error) {
      answer.status = controller.signal.aborted ? 'cancelled' : 'error';
      if (!controller.signal.aborted && !res.destroyed) res.write(`${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'ตอบไม่สำเร็จ' })}\n`);
    }
    await saveReception(session);
    if (!res.destroyed) res.end();
  } catch (error) {
    if (!res.headersSent) next(error);
    else if (!res.destroyed) res.end();
  } finally { if (session && started) finishReceptionTurn(session.id); }
});

kioskRouter.get('/ai-status', async (_req, res) => {
  let webReady = false;
  try {
    const health = await fetch(new URL('/healthz', config.ai.searxngUrl), { signal: AbortSignal.timeout(1500) });
    webReady = health.ok;
  } catch { /* SearXNG ยังไม่เปิด */ }
  let modelReady = false;
  if (config.ai.mode === 'local') {
    try { modelReady = (await fetch(new URL('/v1/models', config.ai.baseUrl), { signal: AbortSignal.timeout(1500) })).ok; } catch { /* model offline */ }
  }
  res.json({ textReady: modelReady || config.ai.navigationOnly, modelReady, navigationOnly: config.ai.navigationOnly, voiceReady: false, voiceMode: 'browser', webReady, simulated: config.robotMode !== 'hermes', mockConnected: config.robotMode === 'mock', commandsEnabled: !hermes || !config.robot.readOnly });
});

kioskRouter.post('/chat', async (req, res, next) => {
  if (config.ai.mode !== 'local') {
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
    res.json(hermes
      ? await handleRobotAiCommand(req.body, { id: null, name: 'จอผู้ช่วย AI' }, requestController.signal)
      : await handleKioskIntent(req.body, undefined, requestController.signal));
  } catch (error) {
    if (!res.destroyed) next(error);
  }
});

const KIOSK_REQUESTER = { id: null, name: 'จอหุ่น (Kiosk)' };
const KIOSK_CANCELLER = { id: null, displayName: 'จอหุ่น (Kiosk)' };

/** GET /api/kiosk/destinations — เฉพาะ POI ที่ is_public = true (RBT-01) */
kioskRouter.get('/destinations', async (req, res, next) => {
  try {
    if (hermes) {
      const map = await getLiveMap();
      const items: KioskDestination[] = (map.pois ?? []).filter(poi => poi.metadata?.is_public !== false && poi.pose
        && [poi.pose.x, poi.pose.y, poi.pose.yaw].every(Number.isFinite) && typeof poi.metadata?.display_name === 'string')
        .map((poi, sortOrder) => ({ code: poi.id, nameTh: poi.metadata!.display_name as string, nameEn: poi.metadata!.display_name as string,
          x: poi.pose!.x, y: poi.pose!.y, headingDeg: poi.pose!.yaw * 180 / Math.PI, zone: '', isPublic: true, isDock: false, sortOrder }));
      res.json({ lang: req.query.lang === 'en' ? 'en' : 'th', items });
      return;
    }
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
    if (hermes) {
      const map = await getLiveMap(true);
      const poi = map.pois?.find(item => item.id === destPoiCode && item.metadata?.is_public !== false);
      if (!poi?.pose) { res.status(404).json({ error: { code: 'unknown_poi', message: 'ไม่พบจุดหมายที่เปิดให้ใช้งานบนหุ่น' } }); return; }
      const job = await createJob(poi.id, 'kiosk_touch', KIOSK_REQUESTER, { requirePublic: true, target: {
        code: poi.id, nameTh: String(poi.metadata?.display_name ?? poi.id), ...poi.pose,
        headingDeg: poi.pose.yaw * 180 / Math.PI, isPublic: true, isDock: false,
      } });
      res.status(201).json(job); return;
    }
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
    if (hermes) {
      const result = await handleRobotAiCommand({ transcript: 'หยุด', lang: 'th' }, KIOSK_REQUESTER);
      if (result.rejected) { res.status(409).json({ error: { code: 'cancel_rejected', message: result.replyText } }); return; }
      res.json({ job: null }); return;
    }
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
