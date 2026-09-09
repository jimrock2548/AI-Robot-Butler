import argon2 from '@node-rs/argon2';
import type { RegisterInput, UserRole } from '@hermes/shared';
import { ApiError } from '../errors';
import { getWorld, type UserRow } from '../db/memory';

/**
 * Auth — Argon2id (NFR-04) + session cookie httpOnly SameSite=Strict (NFR-05)
 * บัญชีใหม่เริ่มต้นเป็น viewer เสมอ (CON-01)
 */

const loginAttempts = new Map<string, number[]>();
const LOGIN_MAX = 5; // ครั้ง/นาที/IP (spec §8.1)
const LOGIN_WINDOW_MS = 60_000;

function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const hits = (loginAttempts.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (hits.length >= LOGIN_MAX) {
    throw new ApiError(429, 'rate_limited', 'พยายามล็อกอินบ่อยเกินไป ลองใหม่ใน 1 นาที');
  }
  hits.push(now);
  loginAttempts.set(ip, hits);
}

async function hashPassword(pw: string): Promise<string> {
  return String(
    await argon2.hash(pw, { memoryCost: 19456, timeCost: 2, outputLen: 32, type: argon2.argon2id }),
  );
}

export async function register(input: RegisterInput, ip?: string): Promise<UserRow> {
  const w = getWorld();
  if (w.getUserByName(input.username)) {
    throw new ApiError(409, 'username_taken', 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  }
  if (input.email && w.users.some((u) => u.email?.toLowerCase() === input.email!.toLowerCase())) {
    throw new ApiError(409, 'email_taken', 'อีเมลนี้ถูกใช้แล้ว');
  }
  const now = new Date().toISOString();
  const user: UserRow = {
    id: ++w.seq.user,
    username: input.username,
    displayName: input.displayName,
    email: input.email || null,
    passwordHash: await hashPassword(input.password),
    role: 'viewer', // CON-01: บัญชีใหม่ = viewer จนกว่า admin จะเลื่อนสิทธิ์
    isActive: true,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  };
  w.users.push(user);
  w.addAudit(user.id, 'user.register', user.username, null, ip);
  return user;
}

export async function login(username: string, password: string, ip?: string): Promise<UserRow> {
  checkLoginRateLimit(ip);
  const w = getWorld();
  const user = w.getUserByName(username);
  if (!user || !user.isActive) {
    throw new ApiError(401, 'invalid_credentials', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) {
    throw new ApiError(401, 'invalid_credentials', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  w.addAudit(user.id, 'user.login', user.username, null, ip);
  return user;
}

export function setUserSession(userId: number): void {
  // เรียกผ่าน req.session ใน route
  void userId;
}
