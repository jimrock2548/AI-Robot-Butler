import { Router } from 'express';
import { userCreateSchema, userPatchSchema } from '@hermes/shared';
import { ApiError } from '../errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { getWorld } from '../db/memory';
import { userPublic } from '../services/robotService';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

/** GET /api/users */
usersRouter.get('/', (req, res, next) => {
  try {
    res.json(getWorld().users.map(userPublic));
  } catch (e) {
    next(e);
  }
});

/** GET /api/users/:id — admin หรือเจ้าของบัญชี */
usersRouter.get('/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = getWorld().getUser(id);
    if (!user) throw new ApiError(404, 'not_found', 'ไม่พบผู้ใช้');
    res.json(userPublic(user));
  } catch (e) {
    next(e);
  }
});

/** POST /api/users */
usersRouter.post('/', async (req, res, next) => {
  try {
    const input = userCreateSchema.parse(req.body);
    const w = getWorld();
    if (w.getUserByName(input.username)) throw new ApiError(409, 'username_taken', 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
    const now = new Date().toISOString();
    // ใช้ hash เดียวกับ authService ผ่านการ import ตรง
    const { hashPassword } = await import('./_hash');
    const user = {
      id: ++w.seq.user,
      username: input.username,
      displayName: input.displayName,
      email: input.email || null,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      isActive: true,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    w.users.push(user);
    w.addAudit(req.user!.id, 'user.create', user.username, { role: user.role }, req.ip);
    res.status(201).json(userPublic(user));
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/users/:id */
usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = userPatchSchema.parse(req.body);
    const w = getWorld();
    const user = w.getUser(Number(req.params.id));
    if (!user) throw new ApiError(404, 'not_found', 'ไม่พบผู้ใช้');
    if (input.displayName !== undefined) user.displayName = input.displayName;
    if (input.email !== undefined) user.email = input.email;
    if (input.role !== undefined) user.role = input.role;
    if (input.isActive !== undefined) user.isActive = input.isActive;
    if (input.password !== undefined) {
      const { hashPassword } = await import('./_hash');
      user.passwordHash = await hashPassword(input.password);
    }
    user.updatedAt = new Date().toISOString();
    w.addAudit(req.user!.id, 'user.update', user.username, { fields: Object.keys(input) }, req.ip);
    res.json(userPublic(user));
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/users/:id — ห้ามลบตัวเอง (spec §8.5) */
usersRouter.delete('/:id', (req, res, next) => {
  try {
    const w = getWorld();
    const id = Number(req.params.id);
    if (id === req.user!.id) {
      throw new ApiError(409, 'self_delete', 'ห้ามลบบัญชีของตัวเอง');
    }
    const user = w.getUser(id);
    if (!user) throw new ApiError(404, 'not_found', 'ไม่พบผู้ใช้');
    user.isActive = false; // soft delete — เก็บ audit history ไว้ครบ
    user.updatedAt = new Date().toISOString();
    w.addAudit(req.user!.id, 'user.delete', user.username, null, req.ip);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
