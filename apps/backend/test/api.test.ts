/**
 * API tests — node built-in test runner + tsx (ไม่ต้องเพิ่ม test framework)
 * รัน: pnpm --filter @hermes/backend test
 *
 * world เป็น in-memory singleton ต่อ process — tests ในไฟล์นี้รันเรียงลำดับ
 * และ state ค้างระหว่าง test ได้ (จงใจออกแบบ flow ให้ state ต่อเนื่อง)
 *
 * หมายเหตุ: login ถูก rate limit 5 ครั้ง/นาที/IP (spec §8.1) —
 * จึงล็อกอินแต่ละ user ครั้งเดียวแล้วแชร์ Client ระหว่าง test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import { getWorld, initWorld } from '../src/db/memory';

let server: Server;
let base: string;
let tickTimer: NodeJS.Timeout | undefined;

/** session cookie helper — เก็บ set-cookie ของแต่ละ user แยกกัน */
class Client {
  private cookie: string | null = null;
  async login(username: string, password: string): Promise<void> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(res.status, 200, `login ${username} should be 200`);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'login should set session cookie');
    this.cookie = setCookie.split(';')[0];
  }
  async api<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => null)) as T;
    return { status: res.status, body };
  }
}

const KIOSK_TOKEN = process.env.KIOSK_TOKEN ?? 'dev-kiosk-token';
const kioskHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${KIOSK_TOKEN}` };

// clients แชร์ข้าม test — ล็อกอินคนละครั้งเดียว (rate limit 5/min/IP)
const users: { admin: Client; op: Client; viewer: Client } = {
  admin: new Client(),
  op: new Client(),
  viewer: new Client(),
};

before(async () => {
  const world = await initWorld(); // seed — เดิมที index.ts ทำตอน boot
  // จำลอง tick ของ startTelemetryPoller (ไม่ broadcast เพราะไม่มี io)
  tickTimer = setInterval(() => {
    world.sim.tick();
    world.tick();
  }, 100);
  tickTimer.unref();

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  clearInterval(tickTimer);
  server?.close();
});

test('health', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; dbMode: string };
  assert.equal(body.ok, true);
  assert.equal(body.dbMode, 'memory');
});

test('kiosk: 401 โดยไม่มี token', async () => {
  const res = await fetch(`${base}/api/kiosk/destinations`);
  assert.equal(res.status, 401);
});

test('kiosk: AI ingress ต้องใช้ device token และยังไม่สั่งหุ่นใน Phase 1', async () => {
  const before = getWorld().jobs.length;
  const anonymous = await fetch(`${base}/api/kiosk/intent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: 'พาไปห้องประชุม', lang: 'th' }),
  });
  assert.equal(anonymous.status, 401);

  const allowed = await fetch(`${base}/api/kiosk/intent`, {
    method: 'POST', headers: kioskHeaders,
    body: JSON.stringify({ transcript: 'พาไปห้องประชุม', lang: 'th' }),
  });
  assert.equal(allowed.status, 501);
  assert.equal(getWorld().jobs.length, before);
});

test('kiosk: destinations มีเฉพาะ POI สาธารณะ (RBT-01)', async () => {
  const res = await fetch(`${base}/api/kiosk/destinations?lang=th`, {
    headers: { Authorization: `Bearer ${KIOSK_TOKEN}` },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    lang: string;
    items: { code: string; nameTh: string; nameEn: string; isDock: boolean }[];
  };
  assert.equal(body.lang, 'th');
  const codes = body.items.map((d) => d.code);
  // SVR เป็น isPublic=false ใน seed — ห้ามโผล่ในจอหุ่น
  assert.ok(!codes.includes('SVR'), 'SVR must not be public');
  assert.ok(codes.includes('RCPT'));
});

test('auth: ล็อกอิน 3 role + me', async () => {
  await users.admin.login('admin', 'admin123');
  await users.op.login('operator', 'operator123');
  await users.viewer.login('viewer', 'viewer123');

  const me = await users.admin.api<{ user: { role: string; username: string } }>('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'admin');
  assert.equal(me.body.user.role, 'admin');
});

test('auth: รหัสผ่านผิด → 401', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrong' }),
  });
  assert.equal(res.status, 401);
});

test('robot: state มี telemetry + link ok', async () => {
  const { status, body } = await users.admin.api<{
    linkStatus: string;
    telemetry: { batteryPct: number } | null;
    simulated: boolean;
  }>('/api/robot/state');
  assert.equal(status, 200);
  assert.equal(body.linkStatus, 'ok');
  assert.ok(body.telemetry, 'memory sim should report telemetry');
  assert.equal(body.simulated, true);
});

test('jobs: สร้างงานได้ → job เดียวต่อหนึ่งครั้ง (spec §6.1)', async () => {
  // ปลายทาง 101 ไกลจุดเริ่มต้น (~20m) — งานคงอยู่ navigating ตลอดช่วง test
  // (RCPT อยู่ตรงจุด spawn หุ่น → ถึงทันทีใน tick แรก)
  const first = await users.admin.api<{ ref: string; status: string; id: number }>(
    '/api/jobs',
    { method: 'POST', body: JSON.stringify({ destPoiCode: '101', source: 'operator' }) },
  );
  assert.equal(first.status, 201);
  assert.match(first.body.ref, /^HX-/);
  assert.ok(['queued', 'navigating'].includes(first.body.status));

  const second = await users.admin.api<{ error: { code: string } }>(
    '/api/jobs',
    { method: 'POST', body: JSON.stringify({ destPoiCode: 'RCPT', source: 'operator' }) },
  );
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'job_in_progress');

  // lock ระหว่าง job ทำงาน → 409 (spec §6.2)
  const lock = await users.admin.api<{ error: { code: string } }>(
    '/api/robot/lock',
    { method: 'POST', body: JSON.stringify({ mode: 'manual' }) },
  );
  assert.equal(lock.status, 409);
  assert.equal(lock.body.error.code, 'job_in_progress');
});

test('RBAC: viewer สั่งงานไม่ได้ (403)', async () => {
  const res = await users.viewer.api(
    '/api/jobs',
    { method: 'POST', body: JSON.stringify({ destPoiCode: 'RCPT' }) },
  );
  assert.equal(res.status, 403);
});

test('kiosk cannot cancel an operator job', async () => {
  const current = getWorld().activeJob();
  assert.equal(current?.source, 'operator');
  const res = await fetch(`${base}/api/kiosk/cancel`, {
    method: 'POST',
    headers: kioskHeaders,
    body: '{}',
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json() as { job: unknown }).job, null);
  assert.equal(getWorld().activeJob()?.id, current.id);
});

test('E-Stop: ยกเลิก job + ปลด lock + mode stopped (spec §6.2 ข้อ 3)', async () => {
  // ใครที่ล็อกอินแล้วกดได้ — viewer ก็กดได้ (NFR-08)
  const res = await users.viewer.api<{ mode: string; currentJob: unknown; lock: { heldBy: number | null } }>(
    '/api/robot/estop',
    { method: 'POST', body: '{}' },
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, 'stopped');
  assert.equal(res.body.currentJob, null);
  assert.equal(res.body.lock.heldBy, null);
  // เริ่มกรณีถัดไปหลังช่วงหยุดฉุกเฉินของหุ่นจำลองผ่านไปแล้ว
  getWorld().sim.releaseToIdle();
});

test('lock: ถือ/heartbeat/ปล่อย เมื่อไม่มี job (spec §6.2)', async () => {
  const acquire = await users.op.api<{ heldBy: number; mode: string; expiresAt: string }>(
    '/api/robot/lock',
    { method: 'POST', body: JSON.stringify({ mode: 'manual' }) },
  );
  assert.equal(acquire.status, 200);
  assert.equal(acquire.body.mode, 'manual');
  assert.ok(acquire.body.expiresAt, 'manual lock ต้องมี TTL');

  // manual control ต้องถือ lock (spec §8.2)
  const noLock = await users.admin.api('/api/robot/manual', {
    method: 'POST',
    body: JSON.stringify({ vx: 0.5, vyaw: 0 }),
  });
  assert.equal(noLock.status, 409);

  const manual = await users.op.api('/api/robot/manual', {
    method: 'POST',
    body: JSON.stringify({ vx: 0.5, vyaw: 1 }),
  });
  assert.equal(manual.status, 204);

  const beat = await users.op.api('/api/robot/lock/heartbeat', { method: 'POST', body: '{}' });
  assert.equal(beat.status, 204);

  const release = await users.op.api('/api/robot/lock', { method: 'DELETE' });
  assert.equal(release.status, 204);

  const state = await users.op.api<{ lock: { heldBy: number | null } }>('/api/robot/state');
  assert.equal(state.body.lock.heldBy, null);
});

test('lock: viewer ห้ามถือ (403), admin แย่งได้ + audit (spec §6.2)', async () => {
  await users.op.api('/api/robot/lock', {
    method: 'POST',
    body: JSON.stringify({ mode: 'manual' }),
  });

  const viewerBlocked = await users.viewer.api('/api/robot/lock', {
    method: 'POST',
    body: JSON.stringify({ mode: 'manual' }),
  });
  // viewer ไม่มีสิทธิ์ถือ lock — 403 จาก requireRole
  assert.equal(viewerBlocked.status, 403);

  // admin แย่ง lock ของ operator ได้ (audit robot.lock.preempt)
  const preempt = await users.admin.api<{ heldBy: number; mode: string }>(
    '/api/robot/lock',
    { method: 'POST', body: JSON.stringify({ mode: 'manual' }) },
  );
  assert.equal(preempt.status, 200);
  assert.equal(preempt.body.mode, 'manual');

  const w = getWorld();
  assert.ok(
    w.audit.some((a) => a.action === 'robot.lock.preempt'),
    'preempt must be audited',
  );

  await users.admin.api('/api/robot/lock', { method: 'DELETE' });
});

test('users: create / patch / soft-delete / viewer เข้าไม่ได้', async () => {
  const created = await users.admin.api<{ id: number; username: string; role: string; isActive: boolean }>(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify({
        username: 'test_user',
        displayName: 'ผู้ใช้ทดสอบ',
        password: 'test1234',
        role: 'viewer',
      }),
    },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.isActive, true);

  // username ซ้ำ → 409
  const dup = await users.admin.api(
    '/api/users',
    {
      method: 'POST',
      body: JSON.stringify({
        username: 'test_user',
        displayName: 'x',
        password: 'test1234',
        role: 'viewer',
      }),
    },
  );
  assert.equal(dup.status, 409);

  const patched = await users.admin.api<{ role: string }>(`/api/users/${created.body.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: 'operator', displayName: 'ผู้ใช้ทดสอบ (แก้)' }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.role, 'operator');

  const deleted = await users.admin.api(`/api/users/${created.body.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const after = await users.admin.api<{ isActive: boolean }>(`/api/users/${created.body.id}`);
  assert.equal(after.body.isActive, false, 'soft delete — บัญชียังอยู่');

  // viewer ไม่เข้าหน้า users ได้ (403)
  const denied = await users.viewer.api('/api/users');
  assert.equal(denied.status, 403);
});

test('maps: draft → POI upsert → publish → rollback (CON-09)', async () => {
  const draft = await users.admin.api<{ version: number; status: string; pois: { code: string }[] }>(
    '/api/maps/draft',
    { method: 'POST', body: '{}' },
  );
  assert.equal(draft.status, 201);
  assert.equal(draft.body.status, 'draft');
  const v2 = draft.body.version;

  // draft ซ้ำ → 409
  const dup = await users.admin.api('/api/maps/draft', { method: 'POST', body: '{}' });
  assert.equal(dup.status, 409);

  const upsert = await users.admin.api<{ pois: { code: string; isPublic: boolean }[] }>(
    `/api/maps/draft/pois/104`,
    {
      method: 'PUT',
      body: JSON.stringify({
        code: '104',
        nameTh: 'ห้อง 104',
        nameEn: 'Room 104',
        x: 5,
        y: 5,
        isPublic: true,
        isDock: false,
        sortOrder: 9,
      }),
    },
  );
  assert.equal(upsert.status, 200);
  assert.ok(upsert.body.pois.some((p) => p.code === '104'));

  const published = await users.admin.api<{ status: string; version: number }>(
    '/api/maps/draft/publish',
    { method: 'POST', body: '{}' },
  );
  assert.equal(published.status, 200);
  assert.equal(published.body.version, v2);

  // POI ใหม่โผล่ใน published map
  const pub = await users.admin.api<{ version: number; pois: { code: string }[] }>('/api/maps/published');
  assert.equal(pub.body.version, v2);
  assert.ok(pub.body.pois.some((p) => p.code === '104'));

  const rollback = await users.admin.api<{ status: string; version: number }>(
    '/api/maps/1/rollback',
    { method: 'POST', body: '{}' },
  );
  assert.equal(rollback.status, 200);
  assert.equal(rollback.body.status, 'published');
  const pub2 = await users.admin.api<{ version: number }>('/api/maps/published');
  assert.equal(pub2.body.version, 1);

  const versions = await users.admin.api<{ version: number; status: string }[]>('/api/maps/versions');
  assert.equal(versions.body.length, 2);
  const v1 = versions.body.find((v) => v.version === 1);
  assert.equal(v1?.status, 'published');
});

test('kiosk: escort → session → cancel (RBT-04/06)', async () => {
  // 101 ไกล spawn — cancel ต้องทันก่อนถึงที่หมาย
  const res = await fetch(`${base}/api/kiosk/escort`, {
    method: 'POST',
    headers: kioskHeaders,
    body: JSON.stringify({ destPoiCode: '101', lang: 'th' }),
  });
  assert.equal(res.status, 201);
  const job = (await res.json()) as { id: number; source: string; status: string };
  assert.equal(job.source, 'kiosk_touch');

  const session = await fetch(`${base}/api/kiosk/session/${job.id}?lang=th`, {
    headers: kioskHeaders,
  });
  assert.equal(session.status, 200);
  const sess = (await session.json()) as { job: { id: number } };
  assert.equal(sess.job.id, job.id);

  const cancel = await fetch(`${base}/api/kiosk/cancel`, {
    method: 'POST',
    headers: kioskHeaders,
    body: '{}',
  });
  assert.equal(cancel.status, 200);
  const cancelled = (await cancel.json()) as { job: { status: string } | null };
  assert.equal(cancelled.job?.status, 'cancelled');
});

test('kiosk: ห้ามสั่ง POI ไม่สาธารณะ (requirePublic)', async () => {
  const res = await fetch(`${base}/api/kiosk/escort`, {
    method: 'POST',
    headers: kioskHeaders,
    body: JSON.stringify({ destPoiCode: 'SVR', lang: 'th' }),
  });
  assert.equal(res.status, 403);
});

test('ai: intent คืน 501 (Phase 2) + log ว่าง', async () => {
  const status = await users.admin.api<{ mode: string }>('/api/ai/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.mode, 'off');
  const intent = await users.admin.api('/api/ai/intent', { method: 'POST', body: '{}' });
  assert.equal(intent.status, 501);

  const rej = await users.admin.api<unknown[]>('/api/ai/rejections');
  assert.equal(rej.status, 200);
  assert.ok(Array.isArray(rej.body));
});

test('offline robot rejects new movement while emergency stop stays available', async () => {
  const sim = getWorld().sim;
  const saved = sim.lastTelemetryAt;
  sim.linkDropUntil = Date.now() + 2_000;
  sim.lastTelemetryAt = Date.now() - 6_000;
  try {
    const lock = await users.op.api<{ error: { code: string } }>('/api/robot/lock', {
      method: 'POST', body: JSON.stringify({ mode: 'manual' }),
    });
    assert.equal(lock.status, 503);
    assert.equal(lock.body.error.code, 'robot_offline');

    const job = await users.op.api<{ error: { code: string } }>('/api/jobs', {
      method: 'POST', body: JSON.stringify({ destPoiCode: '101' }),
    });
    assert.equal(job.status, 503);
    assert.equal(job.body.error.code, 'robot_offline');

    const stop = await users.op.api('/api/robot/estop', { method: 'POST', body: '{}' });
    assert.equal(stop.status, 200);
  } finally {
    sim.linkDropUntil = 0;
    sim.lastTelemetryAt = saved;
  }
});
