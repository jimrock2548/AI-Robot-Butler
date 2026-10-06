import { Router } from 'express';
import { jobCancelSchema, jobCreateSchema } from '@hermes/shared';
import type { JobDetail, JobEvent, JobSummary } from '@hermes/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { createJob, cancelJob } from '../services/jobService';
import { jobSummary } from '../services/robotService';
import { getWorld } from '../db/memory';

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

/** POST /api/jobs — สั่งไป POI (CON-04) — 409 ถ้ามี job ทำงานอยู่ */
jobsRouter.post('/', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const { destPoiCode, source } = jobCreateSchema.parse(req.body);
    const job = await createJob(destPoiCode, source, {
      id: req.user!.id,
      name: req.user!.displayName,
      ip: req.ip,
    });
    res.status(201).json(job);
  } catch (e) {
    next(e);
  }
});

/** GET /api/jobs/current */
jobsRouter.get('/current', (req, res, next) => {
  try {
    const job = getWorld().activeJob();
    res.json(job ? jobSummary(job) : null);
  } catch (e) {
    next(e);
  }
});

/** POST /api/jobs/:id/cancel */
jobsRouter.post('/:id/cancel', requireRole('operator', 'admin'), async (req, res, next) => {
  try {
    const { reason } = jobCancelSchema.parse(req.body ?? {});
    const job = await cancelJob(Number(req.params.id), req.user!, reason, req.ip);
    res.json(job);
  } catch (e) {
    next(e);
  }
});

/** GET /api/jobs — filter: status, source, from, to, pagination (CON-10) */
jobsRouter.get('/', (req, res, next) => {
  try {
    const w = getWorld();
    let jobs = [...w.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const { status, source, from, to } = req.query;
    if (typeof status === 'string') jobs = jobs.filter((j) => j.status === status);
    if (typeof source === 'string') jobs = jobs.filter((j) => j.source === source);
    if (typeof from === 'string') jobs = jobs.filter((j) => j.createdAt >= from);
    if (typeof to === 'string') jobs = jobs.filter((j) => j.createdAt <= to);
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Number(req.query.limit ?? 50));
    const total = jobs.length;
    const items = jobs.slice((page - 1) * limit, page * limit).map(jobSummary);
    res.json({ items, total, page, limit });
  } catch (e) {
    next(e);
  }
});

/** GET /api/jobs/:id — พร้อม job_events */
jobsRouter.get('/:id', (req, res, next) => {
  try {
    const w = getWorld();
    const job = w.jobs.find((j) => j.id === Number(req.params.id));
    if (!job) {
      res.status(404).json({ error: { code: 'not_found', message: 'ไม่พบงานนี้' } });
      return;
    }
    const events: JobEvent[] = w.jobEvents
      .filter((e) => e.jobId === job.id)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((e) => ({ id: e.id, at: e.at, kind: e.kind, detail: e.detail }));
    const detail: JobDetail = { ...jobSummary(job), events, cancelReason: job.cancelReason, departedAt: job.departedAt, arrivedAt: job.arrivedAt };
    res.json(detail);
  } catch (e) {
    next(e);
  }
});
