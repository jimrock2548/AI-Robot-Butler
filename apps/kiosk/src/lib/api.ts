import type { JobSummary, KioskDestination, KioskSession, Lang } from '@hermes/shared';
import type { ReceptionSession } from '@hermes/shared';

/**
 * Kiosk API client — device token (spec §8.6)
 * คำขอเสียงและข้อความผ่าน Kiosk proxy; เสียงยังคืน 501 จนกว่า STT พร้อม
 */
export class KioskApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.message) message = body.error.message;
      if (body.error?.code) code = body.error.code;
    } catch {
      /* body ไม่ใช่ JSON — ใช้ข้อความเริ่มต้น */
    }
    throw new KioskApiError(message, code);
  }
  return (await res.json()) as T;
}

export function kioskDestinations(lang: Lang) {
  return req<{ lang: Lang; items: KioskDestination[] }>(`/kiosk/destinations?lang=${lang}`);
}

export function kioskEscort(destPoiCode: string, lang: Lang) {
  return req<JobSummary>('/kiosk/escort', {
    method: 'POST',
    body: JSON.stringify({ destPoiCode, lang }),
  });
}

export function kioskSession(jobId: number, lang: Lang) {
  return req<KioskSession>(`/kiosk/session/${jobId}?lang=${lang}`);
}

export function kioskCancel() {
  return req<{ job: JobSummary | null }>('/kiosk/cancel', { method: 'POST', body: '{}' });
}

export function kioskAiStatus() {
  return req<{ textReady: boolean; voiceReady: boolean; webReady: boolean; simulated: boolean; mockConnected?: boolean }>('/kiosk/ai-status');
}

export interface KioskChatMessage { role: 'user' | 'assistant'; content: string }
export interface KioskChatSource { title: string; url: string; snippet: string; retrievedAt: string }
export type KioskChatEvent =
  | { type: 'session'; session: ReceptionSession }
  | { type: 'route'; route: 'chat' | 'database' | 'web' | 'action' }
  | { type: 'delta'; text: string }
  | { type: 'done'; sources?: KioskChatSource[]; job?: JobSummary | null }
  | { type: 'error'; message: string };

export async function* kioskChat(messages: KioskChatMessage[], lang: Lang, signal: AbortSignal, conversation?: { id: string; token: string }): AsyncGenerator<KioskChatEvent> {
  const res = await fetch(conversation ? `/api/kiosk/conversation/${conversation.id}/messages` : '/api/kiosk/chat', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(conversation ? { 'x-conversation-token': conversation.token } : {}) },
    body: JSON.stringify(conversation ? { content: messages.at(-1)?.content, lang } : { messages, lang }), signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    throw new KioskApiError(body?.error?.message ?? `HTTP ${res.status}`, body?.error?.code ?? `http_${res.status}`);
  }
  if (!res.body) throw new KioskApiError('ไม่ได้รับคำตอบจากระบบ', 'empty_stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        const event = JSON.parse(line) as KioskChatEvent;
        if (event.type === 'error') throw new KioskApiError(event.message, 'chat_failed');
        if (event.type === 'done') completed = true;
        yield event;
      }
    }
    if (!completed) throw new KioskApiError('การเชื่อมต่อถูกตัดก่อนตอบเสร็จ', 'chat_incomplete');
  } finally {
    reader.releaseLock();
  }
}

export interface KioskVoiceResult {
  transcript: string;
  replyText: string;
  job?: JobSummary | null;
  rejected?: boolean;
}

export function createConversation() {
  return req<{ session: ReceptionSession; token: string }>('/kiosk/conversation', { method: 'POST', body: '{}' });
}
export function readConversation(id: string, token: string) {
  return req<ReceptionSession>(`/kiosk/conversation/${id}`, { headers: { 'x-conversation-token': token } });
}

export function kioskIntent(transcript: string, lang: Lang, signal?: AbortSignal) {
  return req<KioskVoiceResult>('/kiosk/intent', {
    method: 'POST',
    body: JSON.stringify({ transcript, lang }),
    signal,
  });
}

export async function kioskVoice(audio: Blob, lang: Lang): Promise<KioskVoiceResult> {
  const body = new FormData();
  body.append('audio', audio, audio.type.includes('mp4') ? 'speech.mp4' : 'speech.webm');
  body.append('lang', lang);
  const res = await fetch('/api/kiosk/voice', { method: 'POST', body, cache: 'no-store' });
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { code?: string; message?: string } };
      code = data.error?.code ?? code;
      message = data.error?.message ?? message;
    } catch { /* ใช้ HTTP status */ }
    throw new KioskApiError(message, code);
  }
  return (await res.json()) as KioskVoiceResult;
}
