import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getWorld } from '../db/memory';

/**
 * AI — Phase 2 (Qwen บน Jetson)
 * Phase 1: contract พร้อมแล้วตาม spec §8.7, /ai/intent คืน 501
 */
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.post('/intent', (req, res, next) => {
  try {
    res.status(501).json({
      error: {
        code: 'not_implemented',
        message: 'ระบบ AI ยังไม่เชื่อมต่อ (Phase 2)',
      },
    });
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
