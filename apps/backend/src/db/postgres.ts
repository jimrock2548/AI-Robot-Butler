import session from 'express-session';
import argon2 from '@node-rs/argon2';
import { Prisma, PrismaClient } from '@prisma/client';
import type { AiConversation, AiRejection, RoomShape } from '@hermes/shared';
import { getWorld, initWorld } from './memory';

export const prisma = new PrismaClient();
let savedEventId = 0;
let savedAuditId = 0;
let savedConversationId = 0;
let savedRejectionId = 0;
let savedTelemetryAt = '';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const nullableJson = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  value === null || value === undefined ? Prisma.DbNull : json(value);
const id = (value: bigint): number => Number(value);
const date = (value: string | null): Date | null => value ? new Date(value) : null;

/** Restore the single robot world before accepting requests. An interrupted job never resumes by itself. */
export async function initPostgresWorld(): Promise<void> {
  await prisma.$connect();
  const existing = await prisma.users.count();
  const w = await initWorld({ demoUsers: false, demoMap: false });
  if (existing === 0) {
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!password || password.length < 12) {
      throw new Error('DB_MODE=pg ต้องตั้ง INITIAL_ADMIN_PASSWORD อย่างน้อย 12 ตัวอักษรก่อนเริ่มครั้งแรก');
    }
    const now = new Date().toISOString();
    w.users.push({ id: 1, username: 'admin', displayName: 'ผู้ดูแลระบบ', email: null,
      passwordHash: String(await argon2.hash(password, { memoryCost: 19456, timeCost: 2, outputLen: 32, algorithm: 2 })),
      role: 'admin', isActive: true, lastLoginAt: null, createdAt: now, updatedAt: now });
    w.seq.user = 1;
    await persistWorld();
    return;
  }

  const [users, robots, maps, pois, keepouts, jobs, events, telemetry, lock, audit, conversations, rejections] =
    await Promise.all([
      prisma.users.findMany(), prisma.robots.findMany(), prisma.maps.findMany(),
      prisma.pois.findMany(), prisma.keepout_zones.findMany(), prisma.jobs.findMany(),
      prisma.job_events.findMany(), prisma.telemetry_samples.findMany({ orderBy: { at: 'desc' }, take: 2000 }),
      prisma.control_lock.findFirst(), prisma.audit_log.findMany(),
      prisma.ai_conversations.findMany(), prisma.ai_rejections.findMany(),
    ]);

  w.users = users.map((u) => ({
    id: id(u.id), username: u.username, displayName: u.display_name, email: u.email,
    passwordHash: u.password_hash, role: u.role, isActive: u.is_active,
    lastLoginAt: u.last_login_at?.toISOString() ?? null,
    createdAt: u.created_at.toISOString(), updatedAt: u.updated_at.toISOString(),
  }));
  w.robots = robots.map((r) => ({
    id: id(r.id), code: r.code, model: r.model, baseUrl: r.base_url, isEnabled: r.is_enabled,
  }));
  w.maps = maps.map((m) => ({
    id: id(m.id), robotId: id(m.robot_id), version: m.version, status: m.status,
    name: m.name, widthM: Number(m.width_m), heightM: Number(m.height_m),
    rooms: m.geometry as unknown as RoomShape[], slamMapRef: m.slam_map_ref,
    createdBy: m.created_by === null ? null : id(m.created_by),
    publishedBy: m.published_by === null ? null : id(m.published_by),
    publishedAt: m.published_at?.toISOString() ?? null, createdAt: m.created_at.toISOString(),
  }));
  w.pois = pois.map((p) => ({
    id: id(p.id), mapId: id(p.map_id), code: p.code, nameTh: p.name_th,
    nameEn: p.name_en, x: Number(p.x), y: Number(p.y),
    headingDeg: p.heading_deg === null ? null : Number(p.heading_deg), zone: p.zone,
    isPublic: p.is_public, isDock: p.is_dock, sortOrder: p.sort_order,
  }));
  w.keepouts = keepouts.map((k) => ({
    id: id(k.id), mapId: id(k.map_id), name: k.name,
    polygon: k.polygon as unknown as [number, number][],
  }));
  w.jobs = jobs.map((j) => ({
    id: id(j.id), ref: j.ref, robotId: id(j.robot_id), mapVersion: j.map_version,
    destPoiCode: j.dest_poi_code, destName: j.dest_name, source: j.source,
    requestedBy: j.requested_by === null ? null : id(j.requested_by), status: j.status,
    distanceM: j.distance_m === null ? null : Number(j.distance_m),
    departedAt: j.departed_at?.toISOString() ?? null,
    arrivedAt: j.arrived_at?.toISOString() ?? null, cancelReason: j.cancel_reason,
    createdAt: j.created_at.toISOString(),
  }));
  w.jobEvents = events.map((e) => ({
    id: id(e.id), jobId: id(e.job_id), at: e.at.toISOString(), kind: e.kind,
    detail: e.detail as Record<string, unknown> | null,
  }));
  w.telemetrySamples = telemetry.reverse().map((t) => ({
    robotId: id(t.robot_id), at: t.at.toISOString(), batteryPct: Number(t.battery_pct ?? 0),
    x: Number(t.x ?? 0), y: Number(t.y ?? 0), headingDeg: Number(t.heading_deg ?? 0),
    speedMps: Number(t.speed_mps ?? 0), wifiDbm: t.wifi_dbm, cpuPct: t.cpu_pct,
  }));
  w.lock = lock ? {
    robotId: id(lock.robot_id), heldBy: lock.held_by === null ? null : id(lock.held_by),
    mode: lock.mode as 'manual' | 'auto', acquiredAt: lock.acquired_at.toISOString(),
    expiresAt: lock.expires_at?.toISOString() ?? null,
  } : null;
  w.audit = audit.map((a) => ({
    id: id(a.id), at: a.at.toISOString(), userId: a.user_id === null ? null : id(a.user_id),
    action: a.action, target: a.target, detail: a.detail as Record<string, unknown> | null, ip: a.ip,
  }));
  w.aiConversations = conversations.map((c): AiConversation => ({
    id: id(c.id), at: c.at.toISOString(), lang: c.lang, transcript: c.transcript,
    intent: c.intent, confidence: c.confidence === null ? null : Number(c.confidence),
    jobId: c.job_id === null ? null : id(c.job_id), latencyMs: c.latency_ms,
  }));
  w.aiRejections = rejections.map((r): AiRejection => ({
    id: id(r.id), at: r.at.toISOString(), transcript: r.transcript, reason: r.reason,
    detail: r.detail as Record<string, unknown> | null,
  }));

  savedEventId = maxId(w.jobEvents);
  savedAuditId = maxId(w.audit);
  savedConversationId = maxId(w.aiConversations);
  savedRejectionId = maxId(w.aiRejections);
  savedTelemetryAt = w.telemetrySamples.at(-1)?.at ?? '';

  const latest = w.telemetrySamples.at(-1);
  if (latest) {
    w.sim.x = latest.x;
    w.sim.y = latest.y;
    w.sim.headingDeg = latest.headingDeg;
    w.sim.batteryPct = latest.batteryPct;
  }
  w.seq = {
    user: maxId(w.users), map: maxId(w.maps), poi: maxId(w.pois),
    keepout: maxId(w.keepouts), job: maxId(w.jobs), event: maxId(w.jobEvents),
    audit: maxId(w.audit),
    jobRef: Math.max(0, ...w.jobs.map((j) => Number(j.ref.match(/HX-(\d+)/)?.[1] ?? 0))),
  };
  for (const job of w.jobs.filter((j) => j.status === 'queued' || j.status === 'navigating')) {
    job.status = 'failed';
    job.cancelReason = 'backend_restarted';
    w.addJobEvent(job.id, 'failed', { reason: 'backend_restarted' });
  }
  w.lock = null;
  await persistWorld();
}

function maxId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0);
}

let pending: Promise<void> = Promise.resolve();
export function persistWorld(): Promise<void> {
  pending = pending.catch(() => {}).then(async () => {
    try {
      await writeWorld();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (!['P1001', 'P1017', 'P2028'].includes(code ?? '')) throw error;
      // Docker/DB restarts leave Prisma's old connection pool unusable until reconnected.
      await prisma.$disconnect();
      await prisma.$connect();
      await writeWorld();
    }
  });
  return pending;
}

async function writeWorld(): Promise<void> {
  const w = getWorld();
  const newEvents = w.jobEvents.filter((e) => e.id > savedEventId);
  const newTelemetry = w.telemetrySamples.filter((t) => t.at > savedTelemetryAt);
  const newAudit = w.audit.filter((a) => a.id > savedAuditId);
  const newConversations = w.aiConversations.filter((c) => c.id > savedConversationId);
  const newRejections = w.aiRejections.filter((r) => r.id > savedRejectionId);
  await prisma.$transaction(async (tx) => {
    for (const u of w.users) await tx.users.upsert({
      where: { id: BigInt(u.id) },
      create: { id: BigInt(u.id), username: u.username, display_name: u.displayName,
        email: u.email, password_hash: u.passwordHash, role: u.role, is_active: u.isActive,
        last_login_at: date(u.lastLoginAt), created_at: new Date(u.createdAt), updated_at: new Date(u.updatedAt) },
      update: { username: u.username, display_name: u.displayName, email: u.email,
        password_hash: u.passwordHash, role: u.role, is_active: u.isActive,
        last_login_at: date(u.lastLoginAt), updated_at: new Date(u.updatedAt) },
    });
    for (const r of w.robots) await tx.robots.upsert({
      where: { id: BigInt(r.id) },
      create: { id: BigInt(r.id), code: r.code, model: r.model, base_url: r.baseUrl, is_enabled: r.isEnabled },
      update: { code: r.code, model: r.model, base_url: r.baseUrl, is_enabled: r.isEnabled },
    });

    // Archive the old published row first, preserving the partial unique index.
    await tx.maps.updateMany({ where: { status: 'published' }, data: { status: 'archived' } });
    for (const m of w.maps) await tx.maps.upsert({
      where: { id: BigInt(m.id) },
      create: { id: BigInt(m.id), robot_id: BigInt(m.robotId), version: m.version,
        status: m.status, name: m.name, width_m: m.widthM, height_m: m.heightM,
        geometry: json(m.rooms), slam_map_ref: m.slamMapRef,
        created_by: m.createdBy === null ? null : BigInt(m.createdBy),
        published_by: m.publishedBy === null ? null : BigInt(m.publishedBy),
        published_at: date(m.publishedAt), created_at: new Date(m.createdAt) },
      update: { status: m.status, name: m.name, width_m: m.widthM, height_m: m.heightM,
        geometry: json(m.rooms), slam_map_ref: m.slamMapRef,
        published_by: m.publishedBy === null ? null : BigInt(m.publishedBy),
        published_at: date(m.publishedAt) },
    });
    await tx.pois.deleteMany({ where: { id: { notIn: w.pois.map((p) => BigInt(p.id)) } } });
    for (const p of w.pois) await tx.pois.upsert({
      where: { id: BigInt(p.id) },
      create: { id: BigInt(p.id), map_id: BigInt(p.mapId), code: p.code,
        name_th: p.nameTh, name_en: p.nameEn, x: p.x, y: p.y, heading_deg: p.headingDeg,
        zone: p.zone, is_public: p.isPublic, is_dock: p.isDock, sort_order: p.sortOrder },
      update: { name_th: p.nameTh, name_en: p.nameEn, x: p.x, y: p.y,
        heading_deg: p.headingDeg, zone: p.zone, is_public: p.isPublic,
        is_dock: p.isDock, sort_order: p.sortOrder },
    });
    await tx.keepout_zones.deleteMany({ where: { id: { notIn: w.keepouts.map((k) => BigInt(k.id)) } } });
    for (const k of w.keepouts) await tx.keepout_zones.upsert({
      where: { id: BigInt(k.id) },
      create: { id: BigInt(k.id), map_id: BigInt(k.mapId), name: k.name, polygon: json(k.polygon) },
      update: { name: k.name, polygon: json(k.polygon) },
    });

    for (const j of w.jobs) await tx.jobs.upsert({
      where: { id: BigInt(j.id) },
      create: { id: BigInt(j.id), ref: j.ref, robot_id: BigInt(j.robotId),
        map_version: j.mapVersion, dest_poi_code: j.destPoiCode, dest_name: j.destName,
        source: j.source, requested_by: j.requestedBy === null ? null : BigInt(j.requestedBy),
        status: j.status, distance_m: j.distanceM, departed_at: date(j.departedAt),
        arrived_at: date(j.arrivedAt), cancel_reason: j.cancelReason, created_at: new Date(j.createdAt) },
      update: { status: j.status, arrived_at: date(j.arrivedAt), cancel_reason: j.cancelReason },
    });
    await tx.job_events.createMany({
      data: newEvents.map((e) => ({ id: BigInt(e.id), job_id: BigInt(e.jobId),
        at: new Date(e.at), kind: e.kind, detail: nullableJson(e.detail) })), skipDuplicates: true,
    });
    await tx.telemetry_samples.createMany({
      data: newTelemetry.map((t) => ({ robot_id: BigInt(t.robotId), at: new Date(t.at),
        battery_pct: t.batteryPct, x: t.x, y: t.y, heading_deg: t.headingDeg,
        speed_mps: t.speedMps, wifi_dbm: t.wifiDbm, cpu_pct: t.cpuPct })), skipDuplicates: true,
    });
    await tx.audit_log.createMany({
      data: newAudit.map((a) => ({ id: BigInt(a.id), at: new Date(a.at),
        user_id: a.userId === null ? null : BigInt(a.userId), action: a.action,
        target: a.target, detail: nullableJson(a.detail), ip: a.ip })), skipDuplicates: true,
    });
    await tx.ai_conversations.createMany({
      data: newConversations.map((c) => ({ id: BigInt(c.id), at: new Date(c.at),
        lang: c.lang, transcript: c.transcript, intent: c.intent, confidence: c.confidence,
        job_id: c.jobId === null ? null : BigInt(c.jobId), latency_ms: c.latencyMs })), skipDuplicates: true,
    });
    await tx.ai_rejections.createMany({
      data: newRejections.map((r) => ({ id: BigInt(r.id), at: new Date(r.at),
        transcript: r.transcript, reason: r.reason, detail: nullableJson(r.detail) })), skipDuplicates: true,
    });
    if (w.lock) await tx.control_lock.upsert({
      where: { robot_id: BigInt(w.lock.robotId) },
      create: { robot_id: BigInt(w.lock.robotId), held_by: w.lock.heldBy === null ? null : BigInt(w.lock.heldBy),
        mode: w.lock.mode, acquired_at: new Date(w.lock.acquiredAt), expires_at: date(w.lock.expiresAt) },
      update: { held_by: w.lock.heldBy === null ? null : BigInt(w.lock.heldBy),
        mode: w.lock.mode, acquired_at: new Date(w.lock.acquiredAt), expires_at: date(w.lock.expiresAt) },
    });
    else await tx.control_lock.deleteMany();
  }, { timeout: 30_000 });
  savedEventId = newEvents.at(-1)?.id ?? savedEventId;
  savedAuditId = newAudit.at(-1)?.id ?? savedAuditId;
  savedConversationId = newConversations.at(-1)?.id ?? savedConversationId;
  savedRejectionId = newRejections.at(-1)?.id ?? savedRejectionId;
  savedTelemetryAt = newTelemetry.at(-1)?.at ?? savedTelemetryAt;
}

export class PostgresSessionStore extends session.Store {
  get(sid: string, callback: (err: unknown, value?: session.SessionData | null) => void): void {
    prisma.sessions.findUnique({ where: { sid } }).then((row) => {
      callback(null, row && row.expire > new Date() ? row.sess as unknown as session.SessionData : null);
    }).catch(callback);
  }

  set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void): void {
    const expire = value.cookie.expires ?? new Date(Date.now() + 8 * 3600 * 1000);
    prisma.sessions.upsert({ where: { sid }, create: { sid, sess: json(value), expire },
      update: { sess: json(value), expire } }).then(() => callback?.()).catch((err) => callback?.(err));
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    prisma.sessions.deleteMany({ where: { sid } }).then(() => callback?.()).catch((err) => callback?.(err));
  }

  touch(sid: string, value: session.SessionData, callback?: (err?: unknown) => void): void {
    const expire = value.cookie.expires ?? new Date(Date.now() + 8 * 3600 * 1000);
    prisma.sessions.updateMany({ where: { sid }, data: { expire } })
      .then(() => callback?.()).catch((err) => callback?.(err));
  }
}
