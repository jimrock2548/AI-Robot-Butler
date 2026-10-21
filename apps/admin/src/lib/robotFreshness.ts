import type { RobotState, LinkStatus } from '@hermes/shared';

/** Age the last message using the browser clock; never upgrade a server-reported bad link. */
export function ageRobotState(state: RobotState | null, receivedAt: number, now: number): RobotState | null {
  if (!state) return null;
  const age = Math.max(0, now - receivedAt);
  const local: LinkStatus = age >= 5000 ? 'dead' : age >= 2000 ? 'stale' : 'ok';
  const severity = { ok: 0, stale: 1, dead: 2 };
  return severity[local] > severity[state.linkStatus] ? { ...state, linkStatus: local } : state;
}
