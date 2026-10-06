import type { Server } from 'socket.io';
import { config } from '../config';
import { getWorld } from '../db/memory';
import { buildRobotState, linkStatus } from './robotService';
import { persistWorld } from '../db/postgres';
import { maybeAutoDock } from './jobService';
import { hermes, pollHermes } from '../hermes/driver';

/**
 * Telemetry poller ตัวเดียว (spec §5.1) — poll ทุก 500 ms, broadcast ทุก 1000 ms
 * ไม่ว่าจะมี client กี่คน
 */
export function startTelemetryPoller(io: Server): void {
  let lastBroadcast = 0;
  let lastSample = 0;
  let lastLink = '';
  let lastLockSig = '';
  let lastJobSig = '';

  setInterval(async () => {
    const w = getWorld();
    if (hermes) await pollHermes();
    else w.sim.tick();
    w.tick();
    await maybeAutoDock();

    const now = Date.now();
    if (now - lastSample >= 5000) {
      w.addTelemetrySample();
      if (config.dbMode === 'pg') void persistWorld().catch((e) => console.error('[hermes] telemetry save failed:', e));
      lastSample = now;
    }

    if (now - lastBroadcast < config.telemetry.broadcastMs) return;
    lastBroadcast = now;

    const state = buildRobotState();
    io.emit('telemetry', state);

    if (state.linkStatus !== lastLink) {
      lastLink = state.linkStatus;
      io.emit('robot:link', { status: state.linkStatus, lastSeenAt: state.lastSeenAt });
    }
    const lockSig = JSON.stringify([state.lock.heldBy, state.lock.mode]);
    if (lockSig !== lastLockSig) {
      lastLockSig = lockSig;
      io.emit('lock:changed', state.lock);
    }
    const jobSig = state.currentJob
      ? `${state.currentJob.id}:${state.currentJob.status}:${state.currentJob.progress}`
      : 'none';
    if (jobSig !== lastJobSig) {
      lastJobSig = jobSig;
      if (state.currentJob) io.emit('job:update', state.currentJob);
      else io.emit('job:update', null);
    }
  }, config.telemetry.pollMs);

  void linkStatus;
}
