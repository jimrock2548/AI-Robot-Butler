import { config } from '../config';
import { getWorld } from '../db/memory';
import { HermesClient } from './hermesClient';

export const hermes = config.robotMode === 'hermes' ? new HermesClient(config.robot.baseUrl) : null;
export let hermesUptimeAvailable = false;
let activeActionId: number | null = null;
let actionJobId: number | null = null;
let pollBusy = false;
let lastManualPulseAt = 0;
let manualPending: Promise<unknown> | null = null;
let startupAbortPending = Boolean(hermes);

export async function pollHermes(): Promise<void> {
  if (!hermes || pollBusy) return;
  pollBusy = true;
  try {
    const w = getWorld();
    if (startupAbortPending) {
      await hermes.abort();
      startupAbortPending = false;
    }
    const sample = await hermes.sample();
    w.sim.batteryPct = sample.batteryPct;
    w.sim.x = sample.x;
    w.sim.y = sample.y;
    w.sim.headingDeg = sample.headingDeg;
    w.sim.speed = sample.speedMps;
    hermesUptimeAvailable = sample.uptimeSec !== null;
    if (sample.uptimeSec !== null) w.sim.uptimeSec = sample.uptimeSec;
    w.sim.lastTelemetryAt = sample.capturedAt;
    if (activeActionId === null || actionJobId === null) return;
    const action = await hermes.action(activeActionId);
    if (action.state?.status !== 4) return;
    const job = w.jobs.find((j) => j.id === actionJobId);
    if (job?.status === 'navigating') {
      if (action.state.result === 0) {
        w.handleArrival(job.destPoiCode);
        w.sim.mode = 'idle';
        w.sim.target = null;
      }
      else {
        job.status = 'failed';
        job.cancelReason = action.state.reason || `Hermes result ${action.state.result}`;
        w.addJobEvent(job.id, 'failed', { reason: job.cancelReason });
        if (w.lock?.mode === 'auto') w.lock = null;
        w.sim.mode = 'idle';
        w.sim.target = null;
      }
    }
    activeActionId = null;
    actionJobId = null;
  } catch (error) {
    console.error('[hermes] poll failed:', error);
  } finally {
    pollBusy = false;
  }
}

export async function startHermesJob(jobId: number, x: number, y: number, yawDeg: number | null, dock: boolean): Promise<void> {
  if (!hermes) return;
  const action = dock ? await hermes.goHome() : await hermes.moveTo(x, y, yawDeg);
  if (!Number.isInteger(action?.action_id)) throw new Error('Hermes did not return an action_id');
  activeActionId = action.action_id;
  actionJobId = jobId;
}

export async function abortHermesJob(): Promise<void> {
  if (!hermes) return;
  await hermes.abort();
  activeActionId = null;
  actionJobId = null;
}

export async function pulseHermesManual(vx: number, vyaw: number): Promise<void> {
  if (!hermes) return;
  const now = Date.now();
  if (vx !== 0 || vyaw !== 0) {
    if (manualPending || now - lastManualPulseAt < 180) return;
    lastManualPulseAt = now;
    const pending = hermes.moveBy(vx, vyaw);
    manualPending = pending;
    try { await pending; }
    finally { if (manualPending === pending) manualPending = null; }
    return;
  }
  if (manualPending) await manualPending.catch(() => {});
  await hermes.abort();
}
