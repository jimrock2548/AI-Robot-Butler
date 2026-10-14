import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExploreMap } from '../src/hermes/gridMap';

test('map decoding preserves signed world origin and exact cell payload', () => {
  const bytes = Buffer.alloc(40);
  bytes.writeFloatLE(-7.3, 0);
  bytes.writeFloatLE(-6.2, 4);
  bytes.writeUInt32LE(2, 8);
  bytes.writeUInt32LE(2, 12);
  bytes.writeFloatLE(0.05, 16);
  bytes.writeUInt32LE(4, 32);
  bytes.set([0, 127, 128, 255], 36);
  const map = parseExploreMap(bytes);
  assert.ok(Math.abs(map.x + 7.3) < 0.00001);
  assert.deepEqual([...Buffer.from(map.cellsBase64, 'base64')], [0, 127, 128, 255]);
  assert.throws(() => parseExploreMap(bytes.subarray(0, 39)), /invalid/);
  bytes.writeUInt32LE(3, 32);
  assert.throws(() => parseExploreMap(bytes), /invalid/);
  assert.throws(() => parseExploreMap(Buffer.alloc(12)), /incomplete/);
});
