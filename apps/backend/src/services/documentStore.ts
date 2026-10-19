import { config } from '../config';
import { prisma } from '../db/postgres';
import type { Prisma } from '@prisma/client';

const memory = new Map<string, { kind: string; data: unknown }>();
const writes = new Map<string, Promise<void>>();
export async function putDocument<T>(id: string, kind: string, data: T): Promise<void> {
  const value = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
  const pending = (writes.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (config.dbMode === 'pg') {
      await prisma.service_documents.upsert({ where: { id }, create: { id, kind, data: value }, update: { kind, data: value } });
    } else memory.set(id, { kind, data: value });
  });
  writes.set(id, pending);
  try { await pending; } finally { if (writes.get(id) === pending) writes.delete(id); }
}
export async function getDocument<T>(id: string, kind: string): Promise<T | null> {
  await writes.get(id);
  if (config.dbMode === 'pg') {
    const row = await prisma.service_documents.findUnique({ where: { id } });
    return row?.kind === kind ? row.data as T : null;
  }
  const row = memory.get(id);
  return row?.kind === kind ? structuredClone(row.data) as T : null;
}
export async function listDocuments<T>(kind: string): Promise<T[]> {
  await Promise.all(writes.values());
  if (config.dbMode === 'pg') {
    const rows = await prisma.service_documents.findMany({ where: { kind }, orderBy: { updated_at: 'desc' }, take: 100 });
    return rows.map(row => row.data as T);
  }
  return [...memory.values()].filter(row => row.kind === kind).map(row => structuredClone(row.data) as T).reverse().slice(0, 100);
}
