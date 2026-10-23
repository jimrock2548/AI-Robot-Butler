import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getWorld } from '../db/memory';
import { classifyTranscript } from '../services/aiService';
import { config } from '../config';
import { handleRobotAiCommand } from '../services/robotAiService';
import { readAiSettings, updateAiSettings } from '../services/aiSettings';

/**
 * AI — Phase 2 (Qwen บน Jetson)
 * Phase 1: contract พร้อมแล้วตาม spec §8.7, /ai/intent คืน 501
 */
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/status', async (_req, res) => {
  let modelReady = false;
  if (config.ai.mode === 'local') {
    try { modelReady = (await fetch(new URL('/v1/models', config.ai.baseUrl), { signal: AbortSignal.timeout(1500) })).ok; } catch { /* offline */ }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ mode: config.ai.mode, simulated: config.robotMode !== 'hermes', mockConnected: config.robotMode === 'mock', model: config.ai.mode === 'local' ? config.ai.model : null, modelReady, ...readAiSettings() });
});

aiRouter.get('/settings', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readAiSettings());
});
aiRouter.put('/settings', requireRole('admin'), async (req, res, next) => {
  try {
    const before = readAiSettings();
    const settings = await updateAiSettings(req.body);
    getWorld().addAudit(req.user!.id, 'ai.settings.update', 'ai', { before, after: settings }, req.ip);
    res.json(settings);
  } catch (error) { next(error); }
});

aiRouter.post('/command', requireRole('operator', 'admin'), async (req, res, next) => {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    res.json(await handleRobotAiCommand(req.body, { id: req.user!.id, name: req.user!.displayName, ip: req.ip }, controller.signal));
  } catch (error) { if (!res.destroyed) next(error); }
});

aiRouter.post('/intent', async (req, res, next) => {
  try {
    const decision = await classifyTranscript(req.body);
    res.json({ intent: decision.intent, confidence: decision.confidence, args: { poiCode: decision.poiCode ?? null } });
  } catch (e) {
    next(e);
  }
});

aiRouter.get('/rejections', (req, res, next) => {
  try {
    res.json(getWorld().aiRejections);
  } catch (e) {
    next(e);
  }
});

aiRouter.get('/conversations', (req, res, next) => {
  try {
    res.json(getWorld().aiConversations);
  } catch (e) {
    next(e);
  }
});
