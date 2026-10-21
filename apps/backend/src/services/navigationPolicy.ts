import type { LiveRobotMap } from '@hermes/shared';
import { ApiError } from '../errors';
import { config } from '../config';
import { assertLocalizationConfirmed, assertDockVerified } from './robotActivity';

export function validateLiveNavigation(map: LiveRobotMap, target: { x: number; y: number; isDock: boolean }): void {
  assertLocalizationConfirmed();
  if (target.isDock) assertDockVerified();
  const capturedAt = Date.parse(map.capturedAt);
  if (!Number.isFinite(capturedAt) || Date.now() - capturedAt > 5000) throw new ApiError(409, 'map_stale', 'ข้อมูลแผนที่เก่าเกินไป');
  if (map.mappingEnabled !== false) throw new ApiError(409, 'mapping_active', 'ต้องเปลี่ยนหุ่นจากโหมดสร้างแผนที่เป็นโหมดระบุตำแหน่งก่อนนำทาง');
  if (map.localizationQuality === null || map.localizationQuality < config.robot.minLocalizationQuality) {
    throw new ApiError(409, 'localization_unreliable', 'ตำแหน่งหุ่นยังไม่พร้อมสำหรับนำทาง');
  }
  const col = Math.floor((target.x - map.x) / map.resolution);
  const row = Math.floor((target.y - map.y) / map.resolution);
  if (![target.x, target.y].every(Number.isFinite) || col < 0 || row < 0 || col >= map.width || row >= map.height) {
    throw new ApiError(422, 'target_outside_map', 'จุดหมายอยู่นอกแผนที่บนหุ่น');
  }
  if (!target.isDock) {
    const cell = Buffer.from(map.cellsBase64, 'base64')[row * map.width + col];
    if (cell === undefined || cell === 0 || cell >= 128) {
      throw new ApiError(422, 'target_not_free', 'เลือกจุดหมายในพื้นที่ว่างที่สแกนแล้ว');
    }
  }
}
