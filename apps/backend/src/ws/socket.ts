import type { Server, Socket } from 'socket.io';
import { manualControlSchema } from '@hermes/shared';
import { getWorld } from '../db/memory';

/**
 * Socket events ตาม spec §5.2
 * client→server: joystick (เฉพาะผู้ถือ lock, throttle 10 Hz ฝั่ง client)
 */
export function setupSockets(io: Server): void {
  // auth ด้วย session cookie (same-site) — NFR-05
  io.use((socket, next) => {
    const userId = socket.request.session?.userId;
    if (!userId) return next(new Error('unauthorized'));
    next();
  });

  io.on('connection', (socket: Socket) => {
    socket.on('joystick', (data: unknown) => {
      try {
        const w = getWorld();
        const userId = socket.request.session?.userId;
        const user = userId ? w.getUser(userId) : undefined;
        if (!user) return;
        const lock = w.lock;
        if (!lock || lock.heldBy !== user.id || lock.mode !== 'manual') {
          socket.emit('ws:error', {
            code: 'no_manual_lock',
            message: 'ต้องถือ lock แบบ manual ก่อนจึงจะสั่งจอยสติ๊กได้',
          });
          return;
        }
        const parsed = manualControlSchema.safeParse(data);
        if (!parsed.success) return;
        w.sim.setManual(parsed.data.vx, parsed.data.vyaw);
      } catch {
        // ignore — poller จะ broadcast สถานะจริงตามปกติ
      }
    });

    socket.on('disconnect', () => {
      // lock ไม่หลุดเมื่อ client หลุด — ให้ TTL 30 วิ จัดการ (spec §6.2)
    });
  });
}
