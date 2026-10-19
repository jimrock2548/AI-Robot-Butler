import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LibraryMap } from '@hermes/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { getDocument, listDocuments, putDocument } from '../services/documentStore';
import { ApiError } from '../errors';
import { getWorld } from '../db/memory';

const point = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(80),
  x: z.number().finite(), y: z.number().finite(), headingDeg: z.number().min(-360).max(360).default(0) });
export const libraryInput = z.object({
  name: z.string().trim().min(1).max(100), widthM: z.number().positive().max(500), heightM: z.number().positive().max(500),
  pois: z.array(point).max(300), standbyCode: z.string().nullable().default(null),
  returnPolicy: z.enum(['manual', 'after_job']).default('manual'),
}).superRefine((value, ctx) => {
  if (new Set(value.pois.map(p => p.code)).size !== value.pois.length) ctx.addIssue({ code: 'custom', message: 'รหัส POI ต้องไม่ซ้ำกัน' });
  if (value.standbyCode && !value.pois.some(p => p.code === value.standbyCode)) ctx.addIssue({ code: 'custom', message: 'ไม่พบจุดประจำในแผนที่นี้' });
  if (value.returnPolicy === 'after_job' && !value.standbyCode) ctx.addIssue({ code: 'custom', message: 'กำหนดจุดประจำก่อนเลือกกลับหลังจบงาน' });
  if (value.pois.some(p => p.x < 0 || p.x > value.widthM || p.y < 0 || p.y > value.heightM)) ctx.addIssue({ code: 'custom', message: 'POI ต้องอยู่ภายในขอบแผนที่' });
});
export const mapLibraryRouter = Router();
mapLibraryRouter.use(requireAuth, requireRole('admin'));
mapLibraryRouter.get('/', async (_req, res, next) => {
  try { res.json({ maps: await listDocuments<LibraryMap>('map-library'), selection: await getDocument<{ id: string }>('map-library-selection', 'selection') }); }
  catch (error) { next(error); }
});
mapLibraryRouter.post('/', async (req, res, next) => {
  try {
    const map: LibraryMap = { ...libraryInput.parse(req.body), id: randomUUID(), updatedAt: new Date().toISOString() };
    await putDocument(map.id, 'map-library', map);
    getWorld().addAudit(req.user!.id, 'map-library.create', map.id, { name: map.name }, req.ip);
    res.status(201).json(map);
  } catch (error) { next(error); }
});
mapLibraryRouter.put('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    if (!await getDocument(id, 'map-library')) throw new ApiError(404, 'not_found', 'ไม่พบแผนที่');
    const map: LibraryMap = { ...libraryInput.parse(req.body), id, updatedAt: new Date().toISOString() };
    await putDocument(id, 'map-library', map);
    getWorld().addAudit(req.user!.id, 'map-library.update', id, { name: map.name }, req.ip);
    res.json(map);
  } catch (error) { next(error); }
});
mapLibraryRouter.post('/:id/select', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    if (!await getDocument(id, 'map-library')) throw new ApiError(404, 'not_found', 'ไม่พบแผนที่');
    await putDocument('map-library-selection', 'selection', { id });
    getWorld().addAudit(req.user!.id, 'map-library.select-preview', id, null, req.ip);
    res.json({ id, hardwareApplied: false });
  } catch (error) { next(error); }
});
