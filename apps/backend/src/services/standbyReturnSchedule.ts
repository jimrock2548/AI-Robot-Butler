export const standbyReturnDelayMs = 5000;
type Plan = { jobId: number; returnAt: number; generation: number };
let generation = 0;
let pending: Plan | null = null;
export function cancelPendingStandbyReturn() { generation++; pending = null; }
export function scheduleStandbyReturn(jobId: number) {
  cancelPendingStandbyReturn();
  pending = { jobId, returnAt: Date.now() + standbyReturnDelayMs, generation };
}
export function pendingStandbyReturn() { return pending; }
export function isStandbyReturnCurrent(plan: Plan) { return plan.generation === generation; }
export function claimStandbyReturn(plan: Plan) {
  if (pending !== plan || !isStandbyReturnCurrent(plan)) return false;
  pending = null; return true;
}
