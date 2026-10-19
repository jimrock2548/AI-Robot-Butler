import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ReceptionSession, ReceptionMessage } from '@hermes/shared';
import { ApiError } from '../errors';
import { putDocument, getDocument, listDocuments } from './documentStore';

interface StoredSession extends ReceptionSession { tokenHash: string }
const cached = new Map<string, StoredSession>();
export const receptionEvents = new EventEmitter();
receptionEvents.setMaxListeners(100);
const active = new Map<string, AbortController>();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export function publicSession(session: StoredSession): ReceptionSession {
  const { tokenHash: _secret, ...visible } = session;
  return structuredClone(visible);
}
export async function findReception(id: string): Promise<StoredSession> {
  const session = cached.get(id) ?? await getDocument<StoredSession>(id, 'conversation');
  if (!session) throw new ApiError(404, 'not_found', 'ไม่พบบทสนทนา');
  cached.set(id, session);
  return session;
}
export async function authorizeReception(id: string, token: string): Promise<StoredSession> {
  const session = await findReception(id);
  if (!timingSafeEqual(Buffer.from(hash(token)), Buffer.from(session.tokenHash))) {
    throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์อ่านบทสนทนานี้');
  }
  return session;
}
export async function saveReception(session: StoredSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  session.revision++;
  await putDocument(session.id, 'conversation', session);
  receptionEvents.emit('update', publicSession(session));
}
export async function createReception() {
  const token = randomBytes(32).toString('hex');
  const session: StoredSession = { id: randomUUID(), tokenHash: hash(token), mode: 'ai', ownerId: null,
    messages: [], revision: 0, updatedAt: new Date().toISOString() };
  cached.set(session.id, session);
  await saveReception(session);
  return { session: publicSession(session), token };
}
export async function listReceptions(): Promise<ReceptionSession[]> {
  const stored = await listDocuments<StoredSession>('conversation');
  return stored.map(session => publicSession(cached.get(session.id) ?? session));
}
export function appendMessage(session: StoredSession, role: ReceptionMessage['role'], content: string, author?: string) {
  if (session.messages.length >= 200) throw new ApiError(409, 'conversation_full', 'บทสนทนาครบ 200 ข้อความ กรุณาเริ่มใหม่');
  const message: ReceptionMessage = { id: randomUUID(), role, content, at: new Date().toISOString(), status: 'complete', ...(author ? { author } : {}) };
  session.messages.push(message);
  return message;
}
export function beginReceptionTurn(id: string, controller: AbortController) {
  if (active.has(id)) throw new ApiError(409, 'conversation_busy', 'กำลังตอบข้อความก่อนหน้า');
  active.set(id, controller);
}
export function finishReceptionTurn(id: string) { active.delete(id); }
export async function setReceptionMode(id: string, mode: 'ai' | 'staff', userId: number) {
  const session = await findReception(id);
  if (session.mode === 'staff' && session.ownerId !== userId) throw new ApiError(409, 'staff_busy', 'เจ้าหน้าที่อีกคนกำลังดูแลบทสนทนานี้');
  // Abort pending inference/dispatch before transferring ownership.
  active.get(id)?.abort();
  session.mode = mode;
  session.ownerId = mode === 'staff' ? userId : null;
  await saveReception(session);
  return publicSession(session);
}
