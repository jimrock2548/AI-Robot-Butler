import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { getWorld } from '../db/memory';
import { ApiError } from '../errors';
import { appendMessage, findReception, listReceptions, publicSession, receptionEvents, saveReception, setReceptionMode } from '../services/receptionService';

export const receptionRouter = Router();
receptionRouter.use(requireAuth, requireRole('admin', 'operator'));
receptionRouter.get('/', async (_req, res, next) => {
  try { res.json(await listReceptions()); } catch (error) { next(error); }
});
receptionRouter.get('/events', async (req, res, next) => {
  try {
    const snapshot = await listReceptions();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive' });
    res.flushHeaders();
    const write = (data: unknown) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`); };
    write({ type: 'snapshot', sessions: snapshot });
    const onUpdate = (session: unknown) => write({ type: 'session', session });
    receptionEvents.on('update', onUpdate);
    const timer = setInterval(() => {
      const user = getWorld().getUser(req.user!.id);
      if (!user?.isActive || !['admin', 'operator'].includes(user.role)) { res.end(); return; }
      res.write(': heartbeat\n\n');
    }, 15000);
    res.on('close', () => { clearInterval(timer); receptionEvents.off('update', onUpdate); });
  } catch (error) { next(error); }
});
receptionRouter.post('/:id/mode', async (req, res, next) => {
  try {
    const { mode } = z.object({ mode: z.enum(['ai', 'staff']) }).parse(req.body);
    const result = await setReceptionMode(z.string().uuid().parse(req.params.id), mode, req.user!.id);
    getWorld().addAudit(req.user!.id, 'conversation.mode', result.id, { mode }, req.ip);
    res.json(result);
  } catch (error) { next(error); }
});
receptionRouter.post('/:id/messages', async (req, res, next) => {
  try {
    const { content } = z.object({ content: z.string().trim().min(1).max(1200) }).parse(req.body);
    const session = await findReception(z.string().uuid().parse(req.params.id));
    if (session.mode !== 'staff' || session.ownerId !== req.user!.id) throw new ApiError(409, 'not_owner', 'รับช่วงบทสนทนาก่อนส่งข้อความ');
    appendMessage(session, 'staff', content, req.user!.displayName);
    await saveReception(session);
    getWorld().addAudit(req.user!.id, 'conversation.staff_message', session.id, null, req.ip);
    res.json(publicSession(session));
  } catch (error) { next(error); }
});
