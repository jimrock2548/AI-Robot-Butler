import { Router } from 'express';
import { loginSchema, registerSchema } from '@hermes/shared';
import { login, register } from '../services/authService';
import { toSessionUser } from '../middleware/auth';
import { getWorld } from '../db/memory';

export const authRouter = Router();

const ip = (req: { ip?: string }) => req.ip ?? 'unknown';

/** POST /api/auth/register — บัญชีใหม่ = viewer เสมอ (CON-01) */
authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const user = await register(input, ip(req));
    req.session!.userId = user.id;
    res.status(201).json({ user: toSessionUser(user) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/login — rate limit 5 ครั้ง/นาที/IP (spec §8.1) */
authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const user = await login(username, password, ip(req));
    req.session!.userId = user.id;
    res.json({ user: toSessionUser(user) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/logout */
authRouter.post('/logout', (req, res, next) => {
  try {
    req.session.destroy(() => {
      res.clearCookie('hermes.sid');
      res.status(204).end();
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/auth/me — ข้อมูลผู้ใช้ + สิทธิ์ปัจจุบัน (CON-11) */
authRouter.get('/me', (req, res, next) => {
  try {
    const id = req.session?.userId;
    if (!id) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'ยังไม่เข้าสู่ระบบ' } });
      return;
    }
    const user = getWorld().getUser(id);
    if (!user || !user.isActive) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'บัญชีไม่พบหรือถูกปิด' } });
      return;
    }
    res.json({ user: toSessionUser(user) });
  } catch (e) {
    next(e);
  }
});
