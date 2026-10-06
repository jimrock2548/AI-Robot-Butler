import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { initWorld } from '../src/db/memory';

test('admin imports a map as draft and publishes only after dock validation', async () => {
  await initWorld();
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const map = {
      name: 'แผนที่ทดสอบ', widthM: 12, heightM: 8, rooms: [], keepouts: [],
      pois: [
        { code: 'A', nameTh: 'จุด ก', nameEn: 'A', x: 3, y: 2,
          isPublic: true, isDock: false, sortOrder: 0 },
      ],
    };
    const imported = await fetch(`${base}/api/maps/import`, {
      method: 'POST', headers, body: JSON.stringify(map),
    });
    assert.equal(imported.status, 201);
    const draft = await imported.json() as { status: string; version: number };
    assert.equal(draft.status, 'draft');

    const noDock = await fetch(`${base}/api/maps/draft/publish`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal(noDock.status, 422);
    const invalid = await fetch(`${base}/api/maps/draft/pois/DOCK`, {
      method: 'PUT', headers, body: JSON.stringify({ code: 'DOCK', nameTh: 'แท่นชาร์จ',
        nameEn: 'Dock', x: 15, y: 3, isPublic: false, isDock: true, sortOrder: 1 }),
    });
    assert.equal(invalid.status, 200);
    const outside = await fetch(`${base}/api/maps/draft/publish`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal(outside.status, 422);
    const fixed = await fetch(`${base}/api/maps/draft/pois/DOCK`, {
      method: 'PUT', headers, body: JSON.stringify({ code: 'DOCK', nameTh: 'แท่นชาร์จ',
        nameEn: 'Dock', x: 1, y: 3, isPublic: false, isDock: true, sortOrder: 1 }),
    });
    assert.equal(fixed.status, 200);
    const publish = await fetch(`${base}/api/maps/draft/publish`, {
      method: 'POST', headers, body: '{}',
    });
    assert.equal(publish.status, 200);
    const published = await publish.json() as { status: string; version: number };
    assert.equal(published.version, draft.version);
    assert.equal(published.status, 'published');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
