// Exercises only PostgreSQL service_documents; never initializes a robot adapter.
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
loadEnv({ path: new URL('../../../.env', import.meta.url) });
process.env.DB_MODE = 'pg';
process.env.ROBOT_MODE = 'sim';
process.env.DATABASE_URL ??= 'postgresql://hermes:hermes@localhost:5432/hermes';
const { putDocument } = await import('../src/services/documentStore');
const { prisma } = await import('../src/db/postgres');
const ids = [randomUUID(), randomUUID()];
const reader = new PrismaClient();
try {
  const chat = { id: ids[0], mode: 'staff', messages: [{ role: 'user', content: 'storage-check' }, { role: 'staff', content: 'reply-check' }] };
  const map = { id: ids[1], name: 'storage-check', pois: [{ code: 'WAIT' }], standbyCode: 'WAIT' };
  await putDocument(ids[0], 'conversation', chat);
  await Promise.all([
    putDocument(ids[1], 'map-library', { ...map, name: 'earlier-update' }),
    putDocument(ids[1], 'map-library', map),
  ]);
  await prisma.$disconnect();
  const rows = await reader.service_documents.findMany({ where: { id: { in: ids } } });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(r => r.id === ids[0])?.data, chat);
  assert.deepEqual(rows.find(r => r.id === ids[1])?.data, map);
  const result = { date: new Date().toISOString(), database: 'PostgreSQL', checks: ['conversation messages survive disconnect', 'map and standby survive disconnect', 'separate Prisma connection reads persisted documents', 'concurrent updates to one document retain the last submitted revision'], robotAccess: false };
  const output = new URL('../../../reports/offline-reception/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('storage-validation.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await reader.service_documents.deleteMany({ where: { id: { in: ids } } });
  await reader.$disconnect(); await prisma.$disconnect();
}
