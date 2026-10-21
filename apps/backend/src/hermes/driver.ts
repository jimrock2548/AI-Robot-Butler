import { config } from '../config';
import { getWorld } from '../db/memory';
import { HermesClient } from './hermesClient';
import { MockHermesClient } from './mockHermesClient';
import { getMotionSettings } from '../services/motionSettings';

export const hermes = config.robotMode === 'mock' ? new MockHermesClient() : config.robotMode === 'hermes' ? new HermesClient(config.robot.baseUrl, fetch, config.robot.readOnly) : null;
export let hermesUptimeAvailable = false;
export let hermesSpeedAvailable = false;
let activeActionId: number | null = null;
let actionJobId: number | null = null;
let pollBusy = false;
let lastManualPulseAt = 0;
let manualPending: Promise<unknown> | null = null;
let manualGeneration = 0;
let limitsVerifiedAt = 0;
let arrivalHandler: ((jobId: number) => void) | null = null;
export function setArrivalHandler(handler: (jobId: number) => void) { arrivalHandler = handler; }
export function invalidateMotionLimits() { limitsVerifiedAt = 0; }

async function prepareMotion(): Promise<void> {
  if (hermes && config.robot.readOnly) throw new Error('Hermes is read-only: robot commands are disabled');
  if (!hermes || Date.now() - limitsVerifiedAt < 2000) return;
  const limits = getMotionSettings();
  await hermes.configureMotionLimits(limits.linearMps, limits.angularRps);
  limitsVerifiedAt = Date.now();
}

export async function pollHermes(): Promise<void> {
  if (!hermes || pollBusy) return;
  pollBusy = true;
  try {
    const w = getWorld();
    const sample = await hermes.sample();
    w.sim.batteryPct = sample.batteryPct;
    w.sim.x = sample.x;
    w.sim.y = sample.y;
    w.sim.headingDeg = sample.headingDeg;
    hermesSpeedAvailable = sample.speedMps !== null;
    if (sample.speedMps !== null) w.sim.speed = sample.speedMps;
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
        arrivalHandler?.(job.id);
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

export async function startHermesJob(jobId: number, x: number, y: number, yawDeg: number | null, dock: boolean, allowDispatch?: () => boolean): Promise<void> {
  if (!hermes) return;
  const generation = manualGeneration;
  await prepareMotion();
  if (generation !== manualGeneration || getWorld().sim.mode === 'stopped' || (allowDispatch && !allowDispatch())) throw new Error('Motion was cancelled');
  const action = dock ? await hermes.goHome() : await hermes.moveTo(x, y, yawDeg);
  if (generation !== manualGeneration || (allowDispatch && !allowDispatch())) {
    await hermes.abort();
    throw new Error('Motion was cancelled');
  }
  if (!Number.isInteger(action?.action_id)) throw new Error('Hermes did not return an action_id');
  activeActionId = action.action_id;
  actionJobId = jobId;
}

export async function abortHermesJob(): Promise<void> {
  if (!hermes) return;
  manualGeneration++;
  await hermes.abort();
  activeActionId = null;
  actionJobId = null;
}

export async function emergencyStopHermes(): Promise<void> {
  if (!hermes) return;
  manualGeneration++;
  activeActionId = null;
  actionJobId = null;
  await hermes.emergencyStop();
}

export async function pulseHermesManual(vx: number, vyaw: number, ownerId?: number): Promise<void> {
  if (!hermes) return;
  const now = Date.now();
  if (vx !== 0 || vyaw !== 0) {
    if (manualPending || now - lastManualPulseAt < 180) return;
    lastManualPulseAt = now;
    const generation = manualGeneration;
    const pending = (async () => {
      await prepareMotion();
      const w = getWorld();
      if (generation !== manualGeneration || w.lock?.mode !== 'manual' || w.sim.mode !== 'manual'
        || (ownerId !== undefined && w.lock.heldBy !== ownerId)
        || (w.lock.expiresAt && Date.parse(w.lock.expiresAt) <= Date.now())
        || Date.now() - w.sim.lastTelemetryAt >= config.telemetry.deadMs) return;
      const action = await hermes!.moveBy(vx, vyaw);
      if (!action || !Number.isInteger(action.action_id)) throw new Error('Hermes did not confirm manual motion');
    })();
    manualPending = pending;
    try { await pending; }
    finally { if (manualPending === pending) manualPending = null; }
    return;
  }
  manualGeneration++;
  if (manualPending) await manualPending.catch(() => {});
  await hermes.abort();
}
