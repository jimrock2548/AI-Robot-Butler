import { ApiError } from '../errors';

// One synchronous gate shared by maintenance, job dispatch and manual-lock acquisition.
let maintenance = false;
let dispatching = false;
let localizationRequired = false;
let dockVerificationRequired = false;
export function setDockVerificationRequired(value: boolean) { dockVerificationRequired = value; }
export function assertDockVerified() {
  if (dockVerificationRequired) throw new ApiError(409, 'dock_verification_required', 'สร้างแผนที่ใหม่แล้ว กรุณาตรวจและยืนยันตำแหน่งแท่นชาร์จก่อนกลับแท่น');
}
let hardwareIdleCheck: (() => Promise<void>) | null = null;
export function setHardwareIdleCheck(check: (() => Promise<void>) | null) { hardwareIdleCheck = check; }
export async function verifyHardwareIdle() { await hardwareIdleCheck?.(); }
export function assertRobotAvailable(): void {
  if (maintenance) throw new ApiError(409, 'robot_maintenance', 'กำลังตั้งค่าหุ่น กรุณารอให้เสร็จก่อนสั่งงาน');
}
export function isDispatching() { return dispatching; }
export function setDispatching(value: boolean) { dispatching = value; }
export function setLocalizationRequired(value: boolean) { localizationRequired = value; }
export function assertLocalizationConfirmed() {
  if (localizationRequired) throw new ApiError(409, 'localization_required', 'เปลี่ยนแผนที่แล้ว กรุณาระบุตำแหน่งและทิศหุ่นบนแผนที่ใหม่ก่อนนำทาง');
}
export async function withMaintenance<T>(checkIdle: () => void, work: () => Promise<T>): Promise<T> {
  const release = beginMaintenance(checkIdle);
  try { await verifyHardwareIdle(); checkIdle(); return await work(); } finally { release(); }
}
export function beginMaintenance(checkIdle: () => void): () => void {
  assertRobotAvailable();
  if (dispatching) throw new ApiError(409, 'robot_busy', 'กำลังส่งคำสั่งนำทาง');
  checkIdle(); maintenance = true;
  return () => { maintenance = false; };
}
