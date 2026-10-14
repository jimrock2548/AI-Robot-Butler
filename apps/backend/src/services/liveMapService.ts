import type { Server } from 'socket.io';
import type { LiveRobotMap } from '@hermes/shared';
import { hermes } from '../hermes/driver';
import { ApiError } from '../errors';

let snapshot: LiveRobotMap | null = null;
let pending: Promise<LiveRobotMap> | null = null;

/** All viewers share one map request. Failures keep the last timestamp for stale indication. */
export async function getLiveMap(force = false): Promise<LiveRobotMap> {
  if (!hermes) throw new ApiError(409, 'simulated_robot', 'แผนที่นี้อ่านได้เมื่อเชื่อมต่อหุ่นจริง');
  if (!force && snapshot && Date.now() - Date.parse(snapshot.capturedAt) < 2000) return snapshot;
  if (pending) return pending;
  pending = hermes.inspectMap().then((value) => {
    snapshot = value;
    return value;
  }).finally(() => { pending = null; });
  return pending;
}

export function startLiveMapPoller(io: Server): void {
  if (!hermes) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { io.emit('map:live', await getLiveMap(true)); }
    catch { io.emit('map:live-error', { message: 'อ่านแผนที่จากหุ่นไม่ได้ กำลังลองเชื่อมต่อใหม่' }); }
    finally { busy = false; }
  };
  void tick();
  setInterval(() => { void tick(); }, 1000);
}
