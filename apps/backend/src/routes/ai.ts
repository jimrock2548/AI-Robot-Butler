import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getWorld } from '../db/memory';
import { classifyTranscript } from '../services/aiService';
import { config } from '../config';

/**
 * AI — Phase 2 (Qwen บน Jetson)
 * Phase 1: contract พร้อมแล้วตาม spec §8.7, /ai/intent คืน 501
 */
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/status', (_req, res) => {
  res.json({ mode: config.ai.mode, simulated: config.robotMode === 'sim', model: config.ai.mode === 'local' ? config.ai.model : null });
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
