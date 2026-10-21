import test from 'node:test';
import assert from 'node:assert/strict';
import type { RobotState } from '@hermes/shared';
import { ageRobotState } from '../../admin/src/lib/robotFreshness';

test('client loses online status when messages stop, preserves server dead status, and recovers only on fresh receipt', () => {
  const state = { linkStatus: 'ok', mode: 'stopped', telemetry: { x: 1, y: 2 } } as RobotState;
  assert.equal(ageRobotState(null, 0, 10000), null);
  assert.equal(ageRobotState(state, 1000, 2999)?.linkStatus, 'ok');
  assert.equal(ageRobotState(state, 1000, 3000)?.linkStatus, 'stale');
  assert.equal(ageRobotState(state, 1000, 6000)?.linkStatus, 'dead');
  assert.equal(state.linkStatus, 'ok', 'Do not mutate the last server message');
  assert.equal(ageRobotState(state, 7000, 7000)?.linkStatus, 'ok');
  assert.equal(ageRobotState({ ...state, linkStatus: 'dead' }, 7000, 7001)?.linkStatus, 'dead');
  assert.equal(ageRobotState(state, 1000, 6000)?.mode, 'stopped', 'Keep E-stop and last known position intact');
});
