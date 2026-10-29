import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { initWorld, getWorld } from '../src/db/memory';
import { storeArchive, deleteMapArchive, archiveBytes } from '../src/services/robotControlService';
import { getDocument, putDocument } from '../src/services/documentStore';
import { beginMaintenance } from '../src/services/robotActivity';

test('archive deletion requires admin, protects loaded/recovery maps and removes only unused metadata and bytes without hardware', async () => {
  await initWorld({ demoMap: false });
  const bytes = Buffer.from('STCM-test-delete-archive-bytes');
  const active = await storeArchive('กำลังใช้', bytes, 'robot');
  const recovery = await storeArchive('กู้คืน', bytes, 'backup');
  const unused = await storeArchive('ลบได้', bytes, 'upload');
  await putDocument('robot-active-map', 'robot-binding', { archiveId: active.id, resetBackupId: recovery.id, needsLocalization: true, dockNeedsVerification: true });
  const server = createApp().listen(0); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const original = globalThis.fetch;
  let hardwareCalls = 0;
  globalThis.fetch = async () => { hardwareCalls++; throw Error('Hardware must not be contacted'); };
  try {
    const cookies: Record<string, string> = {};
    for (const role of ['admin', 'operator', 'viewer']) {
      const login = await original(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: role, password: role + '123' }) });
      assert.equal(login.status, 200); cookies[role] = login.headers.get('set-cookie')!.split(';')[0];
    }
    const remove = (id: string, role?: string) => original(base + '/robot/map-archives/' + id, { method: 'DELETE', headers: role ? { cookie: cookies[role] } : {} });
    assert.equal((await remove(unused.id)).status, 401);
    for (const role of ['operator', 'viewer']) assert.equal((await remove(unused.id, role)).status, 403);
    assert.equal((await remove('invalid', 'admin')).status, 422);
    for (const [id, code] of [[active.id, 'map_archive_active'], [recovery.id, 'map_archive_recovery']]) {
      const r = await remove(id, 'admin'); assert.equal(r.status, 409); assert.equal((await r.json() as any).error.code, code);
      assert.deepEqual((await archiveBytes(id)).bytes, bytes);
    }
    const protection = await original(base + '/robot/map-archives/protection', { headers: { cookie: cookies.admin } }).then(r => r.json());
    assert.deepEqual(protection, { activeArchiveId: active.id, recoveryArchiveId: recovery.id });
    const release = beginMaintenance(() => {});
    try { await assert.rejects(deleteMapArchive(unused.id), (e: any) => e.code === 'robot_maintenance'); }
    finally { release(); }
    // A corrupt unused file must still be removable; no download validation is needed to delete it.
    await putDocument(unused.id + ':blob', 'robot-map-blob', { base64: 'corrupt' });
    getWorld().sim.lastTelemetryAt = 0;
    assert.equal((await remove(unused.id, 'admin')).status, 204);
    assert.equal(await getDocument(unused.id, 'robot-map-archive'), null);
    assert.equal(await getDocument(unused.id + ':blob', 'robot-map-blob'), null);
    assert.equal((await remove(unused.id, 'admin')).status, 404);
    assert.equal((await original(base + `/robot/map-archives/${unused.id}/download`, { headers: { cookie: cookies.admin } })).status, 404);
    assert.deepEqual((await archiveBytes(active.id)).bytes, bytes);
    await putDocument('robot-active-map', 'robot-binding', { archiveId: active.id, resetBackupId: recovery.id, needsLocalization: false, dockNeedsVerification: false });
    assert.equal((await remove(recovery.id, 'admin')).status, 204, 'finished recovery no longer needs the reset backup');
    assert.equal(hardwareCalls, 0); assert.equal(getWorld().jobs.length, 0);
  } finally { globalThis.fetch = original; server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
