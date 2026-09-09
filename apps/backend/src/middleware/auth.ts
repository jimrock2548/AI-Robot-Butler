import type { NextFunction, Request, Response } from 'express';
import type { SessionUser } from '@hermes/shared';
import { ApiError } from '../errors';
import { getWorld, type UserRow } from '../db/memory';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export function toSessionUser(u: UserRow): SessionUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}

/** ทุก endpoint ต้องล็อกอิน (spec §8 — สิทธิ์ "any") */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const id = req.session?.userId;
  if (!id) {
    next(new ApiError(401, 'unauthorized', 'ต้องเข้าสู่ระบบก่อน'));
    return;
  }
  const user = getWorld().getUser(id);
  if (!user || !user.isActive) {
    next(new ApiError(401, 'unauthorized', 'เซสชันหมดอายุหรือบัญชีถูกปิด'));
    return;
  }
  req.user = user;
  next();
}

/**
 * RBAC ฝั่ง server — NFR-06: ตรวจสิทธิ์ฝั่ง server ไม่ใช่แค่ซ่อนปุ่ม
 * viewer < operator < admin
 */
export function requireRole(...roles: SessionUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new ApiError(401, 'unauthorized', 'ต้องเข้าสู่ระบบก่อน'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, 'forbidden', 'สิทธิ์ไม่เพียงพอสำหรับคำสั่งนี้'));
      return;
    }
    next();
  };
}
