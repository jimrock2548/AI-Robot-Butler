import type { ApiErrorBody } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

interface ErrorShape {
  error?: { code?: string; message?: string; detail?: unknown };
}

/**
 * Fetch client — credentials: 'include' (session cookie, ห้ามเก็บ token ใน localStorage — NFR-05)
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: ErrorShape | undefined;
    try {
      body = (await res.json()) as ErrorShape;
    } catch {
      // ignore
    }
    throw new ApiError(body?.error?.message ?? `HTTP ${res.status}`, body?.error?.code ?? 'http', body?.error?.detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type { ApiErrorBody };
