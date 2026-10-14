import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LiveRobotMap } from '@hermes/shared';
import { validateLiveNavigation } from '../src/services/navigationPolicy';

test('live navigation requires fresh localization mode and a known free destination in signed coordinates', () => {
  const map: LiveRobotMap = { x: -1, y: -1, width: 2, height: 2, resolution: 1,
    cellsBase64: Buffer.from([127, 0, 128, 127]).toString('base64'),
    localizationQuality: 90, mappingEnabled: false, home: null, poiCount: 0,
    modelName: null, softwareVersion: null, dockingStatus: null, capturedAt: new Date().toISOString() };
  const target = { x: -0.5, y: -0.5, isDock: false };
  assert.doesNotThrow(() => validateLiveNavigation(map, target));
  assert.throws(() => validateLiveNavigation({ ...map, mappingEnabled: true }, target), /โหมดสร้างแผนที่/);
  assert.throws(() => validateLiveNavigation({ ...map, mappingEnabled: null }, target), /โหมดสร้างแผนที่/);
  assert.throws(() => validateLiveNavigation({ ...map, localizationQuality: 0 }, target), /ตำแหน่งหุ่น/);
  assert.throws(() => validateLiveNavigation({ ...map, capturedAt: new Date(Date.now() - 6000).toISOString() }, target), /เก่าเกินไป/);
  assert.throws(() => validateLiveNavigation(map, { x: 1, y: 0, isDock: false }), /นอกแผนที่/);
  assert.throws(() => validateLiveNavigation(map, { x: 0.5, y: -0.5, isDock: false }), /พื้นที่ว่าง/);
  assert.throws(() => validateLiveNavigation(map, { x: -0.5, y: 0.5, isDock: false }), /พื้นที่ว่าง/);
});
