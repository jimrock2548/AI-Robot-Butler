import type { NextFunction, Request, Response } from 'express';
import { isApiError, isZodError } from '../errors';

/** รูปแบบ error ตาม spec §8: { error: { code, message, detail? } } */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isApiError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, detail: err.detail } });
    return;
  }
  if (isZodError(err)) {
    res.status(422).json({
      error: {
        code: 'validation',
        message: 'ข้อมูลไม่ถูกต้อง',
        detail: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  console.error('[hermes] unhandled error:', err);
  res.status(500).json({ error: { code: 'internal', message: 'เกิดข้อผิดพลาดภายในระบบ' } });
}
