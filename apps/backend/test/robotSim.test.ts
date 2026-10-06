import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RobotSim } from '../src/sim/robotSim';

test('manual drive stops when commands stop arriving', async () => {
  const sim = new RobotSim();
  sim.mode = 'manual';
  sim.setManual(1, 0);
  sim.tick();
  assert.ok(sim.speed > 0);

  await new Promise((resolve) => setTimeout(resolve, 350));
  sim.tick();
  assert.equal(sim.speed, 0);
});

test('halt and emergency stop set speed to zero immediately', () => {
  const sim = new RobotSim();
  sim.startNavigation({ x: 20, y: 9, poiCode: '101' });
  sim.tick();
  assert.ok(sim.speed > 0);
  const x = sim.x;
  sim.halt();
  assert.equal(sim.speed, 0);
  sim.tick();
  assert.equal(sim.x, x);

  sim.estop();
  assert.equal(sim.speed, 0);
  assert.equal(sim.mode, 'stopped');
});

test('cancelling navigation clears the target and prevents further travel', () => {
  const sim = new RobotSim();
  sim.startNavigation({ x: 20, y: 9, poiCode: '101' });
  sim.tick();
  const x = sim.x;
  sim.releaseToIdle();
  sim.tick();
  assert.equal(sim.x, x);
  assert.equal(sim.target, null);
  assert.equal(sim.speed, 0);
});
