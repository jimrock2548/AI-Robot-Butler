import type { JobSummary, KioskDestination, Lang } from '@hermes/shared';

/**
 * Kiosk API client — device token (spec §8.6)
 * เข้าถึงได้เฉพาะ 4 endpoint: destinations / escort / session / cancel
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN = process.env.NEXT_PUBLIC_KIOSK_TOKEN ?? 'dev-kiosk-token';

export class KioskApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
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
  return req<{ job: JobSummary; lang: Lang }>(`/kiosk/session/${jobId}?lang=${lang}`);
}

export function kioskCancel() {
  return req<{ job: JobSummary | null }>('/kiosk/cancel', { method: 'POST', body: '{}' });
}
