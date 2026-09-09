import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { ApiError } from '../errors';

/**
 * จอหุ่นใช้ device token ไม่ใช่บัญชีผู้ใช้ (spec §8.6)
 * ส่งผ่าน header `Authorization: Bearer <token>` หรือ query `kioskToken`
 */
export function requireKioskToken(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token =
    header?.startsWith('Bearer ') ? header.slice(7) : (req.query.kioskToken as string | undefined);
  if (token !== config.kioskToken) {
    next(new ApiError(401, 'unauthorized', 'device token ไม่ถูกต้อง'));
    return;
  }
  next();
}
