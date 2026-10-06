import { Router } from 'express';
import type { Server } from 'socket.io';
import { keepoutsSchema, mapImportSchema, poiUpsertSchema } from '@hermes/shared';
import type { MapFull, MapVersionSummary, Poi } from '@hermes/shared';
import { ApiError } from '../errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { getWorld, type MapRow, type PoiRow } from '../db/memory';
import { config } from '../config';

let io: Server | null = null;
export function setMapIo(server: Server): void {
  io = server;
}

export const mapsRouter = Router();
mapsRouter.use(requireAuth);

function mapSummary(m: MapRow): MapVersionSummary {
  const w = getWorld();
  return {
    id: m.id,
    version: m.version,
    status: m.status,
    name: m.name,
    widthM: m.widthM,
    heightM: m.heightM,
    publishedBy: w.userName(m.publishedBy),
    publishedAt: m.publishedAt,
    createdAt: m.createdAt,
  };
}

function poiView(p: PoiRow): Poi {
  return {
    code: p.code,
    nameTh: p.nameTh,
    nameEn: p.nameEn,
    x: p.x,
    y: p.y,
    headingDeg: p.headingDeg,
    zone: p.zone,
    isPublic: p.isPublic,
    isDock: p.isDock,
    sortOrder: p.sortOrder,
  };
}

function mapFull(m: MapRow): MapFull {
  const w = getWorld();
  return {
    ...mapSummary(m),
    rooms: m.rooms,
    pois: w.mapPois(m.id).map(poiView),
    keepouts: w.keepouts.filter((k) => k.mapId === m.id),
  };
}

function nextVersion(w: ReturnType<typeof getWorld>): number {
  return w.maps.reduce((max, m) => Math.max(max, m.version), 0) + 1;
}

/** Import a surveyed floor plan as a draft; publishing remains a separate admin action. */
mapsRouter.post('/import', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    if (w.findDraftMap()) throw new ApiError(409, 'draft_exists', 'มีฉบับร่างอยู่แล้ว');
    const input = mapImportSchema.parse(req.body);
    const now = new Date().toISOString();
    const draft: MapRow = {
      id: ++w.seq.map, robotId: w.robot().id, version: nextVersion(w), status: 'draft',
      name: input.name, widthM: input.widthM, heightM: input.heightM,
      rooms: input.rooms, slamMapRef: input.slamMapRef ?? null,
      createdBy: req.user!.id, publishedBy: null, publishedAt: null, createdAt: now,
    };
    w.maps.push(draft);
    for (const poi of input.pois) w.pois.push({
      id: ++w.seq.poi, mapId: draft.id, code: poi.code, nameTh: poi.nameTh,
      nameEn: poi.nameEn, x: poi.x, y: poi.y, headingDeg: poi.headingDeg ?? null,
      zone: poi.zone ?? null, isPublic: poi.isPublic, isDock: poi.isDock,
      sortOrder: poi.sortOrder,
    });
    for (const zone of input.keepouts) w.keepouts.push({
      id: ++w.seq.keepout, mapId: draft.id, name: zone.name,
      polygon: zone.polygon as [number, number][],
    });
    w.addAudit(req.user!.id, 'map.import', `v${draft.version}`, { pois: input.pois.length }, req.ip);
    res.status(201).json(mapFull(draft));
  } catch (e) { next(e); }
});

/** GET /api/maps/published — เวอร์ชันที่เผยแพร่สำหรับผู้ใช้คอนโซลที่ล็อกอินแล้ว */
mapsRouter.get('/published', (req, res, next) => {
  try {
    const m = getWorld().findPublishedMap();
    if (!m) {
      res.status(404).json({ error: { code: 'not_found', message: 'ยังไม่มีแผนที่ที่เผยแพร่' } });
      return;
    }
    res.json(mapFull(m));
  } catch (e) {
    next(e);
  }
});

/** GET /api/maps/draft — ฉบับร่าง (admin) */
mapsRouter.get('/draft', requireRole('admin'), (req, res, next) => {
  try {
    const d = getWorld().findDraftMap();
    if (!d) {
      res.status(404).json({ error: { code: 'not_found', message: 'ยังไม่มีฉบับร่าง' } });
      return;
    }
    res.json(mapFull(d));
  } catch (e) {
    next(e);
  }
});

/** POST /api/maps/draft — สร้างร่างจากเวอร์ชันที่เผยแพร่อยู่ (CON-09) */
mapsRouter.post('/draft', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    if (w.findDraftMap()) {
      throw new ApiError(409, 'draft_exists', 'มีฉบับร่างอยู่แล้ว แก้หรือเผยแพร่ก่อน');
    }
    const pub = w.findPublishedMap();
    if (!pub) throw new ApiError(409, 'no_map', 'ยังไม่มีแผนที่ที่เผยแพร่');
    const now = new Date().toISOString();
    const m: MapRow = {
      id: ++w.seq.map,
      robotId: pub.robotId,
      version: nextVersion(w),
      status: 'draft',
      name: pub.name,
      widthM: pub.widthM,
      heightM: pub.heightM,
      rooms: JSON.parse(JSON.stringify(pub.rooms)),
      slamMapRef: pub.slamMapRef,
      createdBy: req.user!.id,
      publishedBy: null,
      publishedAt: null,
      createdAt: now,
    };
    w.maps.push(m);
    for (const p of w.mapPois(pub.id)) {
      w.pois.push({ ...p, id: ++w.seq.poi, mapId: m.id });
    }
    for (const k of w.keepouts.filter((k) => k.mapId === pub.id)) {
      w.keepouts.push({ ...k, id: ++w.seq.keepout, mapId: m.id });
    }
    w.addAudit(req.user!.id, 'map.draft_created', `v${m.version}`, null, req.ip);
    res.status(201).json(mapFull(m));
  } catch (e) {
    next(e);
  }
});

function requireDraft() {
  const w = getWorld();
  const d = w.findDraftMap();
  if (!d) throw new ApiError(404, 'not_found', 'ยังไม่มีฉบับร่าง');
  return d;
}

/** PUT /api/maps/draft/pois/:code — เพิ่ม/แก้ POI (CON-06) */
mapsRouter.put('/draft/pois/:code', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    const draft = requireDraft();
    const input = poiUpsertSchema.parse(req.body);
    if (input.code !== req.params.code) throw new ApiError(422, 'code_mismatch', 'รหัสจุดรับไม่ตรงกับ URL');
    const existing = w.mapPois(draft.id).find((p) => p.code === req.params.code);
    if (existing) {
      Object.assign(existing, {
        nameTh: input.nameTh,
        nameEn: input.nameEn,
        x: input.x,
        y: input.y,
        headingDeg: input.headingDeg ?? null,
        zone: input.zone ?? null,
        isPublic: input.isPublic,
        isDock: input.isDock,
        sortOrder: input.sortOrder,
      });
    } else {
      w.pois.push({
        id: ++w.seq.poi,
        mapId: draft.id,
        code: input.code,
        nameTh: input.nameTh,
        nameEn: input.nameEn,
        x: input.x,
        y: input.y,
        headingDeg: input.headingDeg ?? null,
        zone: input.zone ?? null,
        isPublic: input.isPublic,
        isDock: input.isDock,
        sortOrder: input.sortOrder,
      });
    }
    w.addAudit(req.user!.id, 'map.poi_upsert', req.params.code, null, req.ip);
    res.json(mapFull(draft));
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/maps/draft/pois/:code */
mapsRouter.delete('/draft/pois/:code', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    const draft = requireDraft();
    const before = w.pois.length;
    w.pois = w.pois.filter((p) => !(p.mapId === draft.id && p.code === req.params.code));
    if (w.pois.length === before) throw new ApiError(404, 'not_found', 'ไม่พบ POI นี้ในฉบับร่าง');
    w.addAudit(req.user!.id, 'map.poi_delete', req.params.code, null, req.ip);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

/** PUT /api/maps/draft/keepouts — อัปเดตเขตห้ามผ่านทั้งหมด */
mapsRouter.put('/draft/keepouts', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    const draft = requireDraft();
    const zones = keepoutsSchema.parse(req.body);
    const oldIds = new Set(w.keepouts.filter((k) => k.mapId === draft.id).map((k) => k.id));
    w.keepouts = w.keepouts.filter((k) => k.mapId !== draft.id);
    for (const z of zones) {
      const keepId = !!z.id && oldIds.delete(z.id);
      w.keepouts.push({
        id: keepId ? z.id! : ++w.seq.keepout,
        mapId: draft.id,
        name: z.name,
        polygon: z.polygon as [number, number][],
      });
    }
    w.addAudit(req.user!.id, 'map.keepouts_update', `v${draft.version}`, { zones: zones.length }, req.ip);
    res.json(mapFull(draft));
  } catch (e) {
    next(e);
  }
});

/** POST /api/maps/draft/publish — เผยแพร่ (CON-09) → broadcast map:published */
mapsRouter.post('/draft/publish', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    const draft = requireDraft();
    if (config.robotMode === 'hermes' && !draft.slamMapRef) {
      throw new ApiError(422, 'missing_slam_map_ref', 'ต้องระบุแผนที่ SLAM ของหุ่นจริงก่อนเผยแพร่');
    }
    const points = w.mapPois(draft.id);
    if (!points.some((p) => p.isDock)) throw new ApiError(422, 'missing_dock', 'ต้องกำหนดแท่นชาร์จก่อนเผยแพร่');
    if (points.some((p) => p.x < 0 || p.x > draft.widthM || p.y < 0 || p.y > draft.heightM)) {
      throw new ApiError(422, 'poi_outside_map', 'มีจุดรับอยู่นอกขอบแผนที่');
    }
    const old = w.findPublishedMap();
    if (old) old.status = 'archived';
    draft.status = 'published';
    draft.publishedBy = req.user!.id;
    draft.publishedAt = new Date().toISOString();
    w.addAudit(req.user!.id, 'map.publish', `v${draft.version}`, { previous: old?.version ?? null }, req.ip);
    io?.emit('map:published', { version: draft.version, publishedBy: w.userName(draft.publishedBy) });
    res.json(mapFull(draft));
  } catch (e) {
    next(e);
  }
});

/** POST /api/maps/:version/rollback — ย้อนกลับเวอร์ชัน (CON-09) */
mapsRouter.post('/:version/rollback', requireRole('admin'), (req, res, next) => {
  try {
    const w = getWorld();
    const target = w.maps.find((m) => m.version === Number(req.params.version));
    if (!target) throw new ApiError(404, 'not_found', 'ไม่พบเวอร์ชันนี้');
    if (target.status === 'published') throw new ApiError(409, 'already_published', 'เวอร์ชันนี้เผยแพร่อยู่แล้ว');
    if (target.status !== 'archived') throw new ApiError(409, 'not_archived', 'ย้อนกลับได้เฉพาะเวอร์ชันที่เคยเผยแพร่');
    const current = w.findPublishedMap();
    if (current) current.status = 'archived';
    target.status = 'published';
    target.publishedBy = req.user!.id;
    target.publishedAt = new Date().toISOString();
    w.addAudit(req.user!.id, 'map.rollback', `v${target.version}`, null, req.ip);
    io?.emit('map:published', { version: target.version, publishedBy: w.userName(target.publishedBy) });
    res.json(mapFull(target));
  } catch (e) {
    next(e);
  }
});

/** GET /api/maps/versions — ประวัติเวอร์ชัน (CON-09) */
mapsRouter.get('/versions', (req, res, next) => {
  try {
    const versions = getWorld()
      .maps.filter((m) => m.robotId === 1)
      .sort((a, b) => b.version - a.version)
      .map(mapSummary);
    res.json(versions);
  } catch (e) {
    next(e);
  }
});

/** GET /api/pois — รายการ POI จากเวอร์ชันที่เผยแพร่ */
mapsRouter.get('/pois', (req, res, next) => {
  try {
    const publicOnly = req.query.publicOnly === '1';
    const pois = getWorld()
      .publishedPois()
      .filter((p) => (publicOnly ? p.isPublic : true))
      .map(poiView);
    res.json(pois);
  } catch (e) {
    next(e);
  }
});
