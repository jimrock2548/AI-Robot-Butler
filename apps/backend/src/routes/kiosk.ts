import { Router } from 'express';
import { kioskEscortSchema } from '@hermes/shared';
import type { JobSummary, KioskDestination } from '@hermes/shared';
import { requireKioskToken } from '../middleware/kioskToken';
import { createJob, cancelJob } from '../services/jobService';
import { jobSummary } from '../services/robotService';
import { getWorld } from '../db/memory';

/**
 * Kiosk (จอบนตัวหุ่น) — device token, จำกัด 4 endpoint (spec §8.6)
 */
export const kioskRouter = Router();
kioskRouter.use(requireKioskToken);

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
kioskRouter.post('/escort', (req, res, next) => {
  try {
    const { destPoiCode } = kioskEscortSchema.parse(req.body);
    const job = createJob(destPoiCode, 'kiosk_touch', KIOSK_REQUESTER, { requirePublic: true });
    res.status(201).json(job);
  } catch (e) {
    next(e);
  }
});

/** GET /api/kiosk/session/:jobId — ความคืบหน้าสำหรับหน้าจอนำทาง */
kioskRouter.get('/session/:jobId', (req, res, next) => {
  try {
    const job = getWorld().jobs.find((j) => j.id === Number(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: { code: 'not_found', message: 'ไม่พบงานนี้' } });
      return;
    }
    const summary: JobSummary = jobSummary(job);
    res.json({ job: summary, lang: req.query.lang === 'en' ? 'en' : 'th' });
  } catch (e) {
    next(e);
  }
});

/** POST /api/kiosk/cancel — ผู้มาเยือนกดปุ่มหยุด (RBT-06) */
kioskRouter.post('/cancel', (req, res, next) => {
  try {
    const w = getWorld();
    const job = w.activeJob();
    if (!job) {
      res.json({ job: null });
      return;
    }
    // cancelJob() คืนค่า JobSummary มาแล้ว (ไม่ต้องผ่าน jobSummary() ซ้ำ)
    const summary: JobSummary = cancelJob(job.id, KIOSK_CANCELLER, 'ยกเลิกจากจอหุ่น');
    res.json({ job: summary });
  } catch (e) {
    next(e);
  }
});
