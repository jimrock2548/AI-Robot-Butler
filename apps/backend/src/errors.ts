import { ZodError } from 'zod';

/**
 * รูปแบบ error ตาม spec §8: { error: { code, message, detail? } }
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function isZodError(e: unknown): e is ZodError {
  return e instanceof ZodError;
}
