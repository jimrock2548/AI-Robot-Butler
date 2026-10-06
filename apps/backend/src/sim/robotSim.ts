/**
 * หุ่นจำลอง — ใช้แทน Hermes Pro Max ในโหมด DB_MODE=memory
 * (เมื่อต่อหุ่นจริง hermesClient.ts จะเป็นผู้ให้ telemetry แทน — spec §4.3)
 *
 * ฟิสิกส์: เดิน 0.6 m/s ขณะนำทาง, จอยสติ๊กสูงสุด 0.6 m/s หมุน 1.5 rad/s
 */

export type SimMode = 'idle' | 'manual' | 'navigating' | 'docking' | 'stopped';

export interface SimTarget {
  x: number;
  y: number;
  poiCode: string;
}

const NAV_SPEED = 0.6; // m/s
const JOY_MAX_SPEED = 0.6; // m/s
const JOY_MAX_YAW = 1.5; // rad/s
const ARRIVE_DIST = 0.15; // m

export class RobotSim {
  x = 4;
  y = 9;
  headingDeg = 90;
  speed = 0;
  batteryPct = 92;
  wifiDbm = -55;
  cpuPct = 24;
  lidar: 'ok' | 'warn' | 'fault' = 'ok';
  uptimeSec = 3 * 3600 + 12 * 60; // เริ่มที่ ~3 ชม. เพื่อตัวเลขสมจริง
  mode: SimMode = 'idle';
  paused = false;
  target: SimTarget | null = null;
  lastTelemetryAt = Date.now();

  /** เรียกโดย world เมื่อถึงที่หมาย */
  onArrived: ((poiCode: string) => void) | null = null;

  /** ช่วงเวลาที่ link ถูกจำลองว่าหลุด (สำหรับทดสอบ stale/dead) */
  linkDropUntil = 0;

  private commandedVx = 0;
  private commandedVyaw = 0;
  private lastManualCommandAt = 0;
  private lastTick = Date.now();
  private stoppedSince: number | null = null;

  setManual(vx: number, vyaw: number): void {
    if (this.mode !== 'manual') return;
    this.paused = false;
    this.commandedVx = clamp(vx, -1, 1);
    this.commandedVyaw = clamp(vyaw, -3, 3);
    this.lastManualCommandAt = Date.now();
  }

  startNavigation(target: SimTarget): void {
    this.mode = 'navigating';
    this.paused = false;
    this.target = target;
    this.commandedVx = 0;
    this.commandedVyaw = 0;
  }

  startDocking(target: SimTarget): void {
    this.mode = 'docking';
    this.paused = false;
    this.target = target;
    this.commandedVx = 0;
    this.commandedVyaw = 0;
  }

  /** POST /robot/halt — หยุดขับเคลื่อน ไม่ยกเลิก job */
  halt(): void {
    this.paused = true;
    this.commandedVx = 0;
    this.commandedVyaw = 0;
    this.speed = 0;
  }

  /** E-Stop — หยุดทุกอย่างเป็นศูนย์ (spec §6.2 ข้อ 3) */
  estop(): void {
    this.mode = 'stopped';
    this.paused = false;
    this.target = null;
    this.commandedVx = 0;
    this.commandedVyaw = 0;
    this.speed = 0;
    this.stoppedSince = Date.now();
  }

  /** หยุด action ปัจจุบันและกลับ idle (ใช้เมื่อยกเลิกงานหรือปล่อย lock) */
  releaseToIdle(): void {
    this.mode = 'idle';
    this.stoppedSince = null;
    this.paused = false;
    this.target = null;
    this.speed = 0;
    this.commandedVx = 0;
    this.commandedVyaw = 0;
  }

  distanceToTarget(): number | null {
    if (!this.target) return null;
    return Math.hypot(this.target.x - this.x, this.target.y - this.y);
  }

  tick(): void {
    const now = Date.now();
    const dt = Math.min(2, Math.max(0.05, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.uptimeSec += dt;

    // link drop จำลอง: หยุดอัปเดต lastTelemetryAt เพื่อทดสอบ stale/dead
    const dropping = now < this.linkDropUntil;

    // Dead-man switch: หยุดเมื่อคำสั่งควบคุมหายไปเกิน 300 ms
    if (this.mode === 'manual' && now - this.lastManualCommandAt > 300) {
      this.commandedVx = 0;
      this.commandedVyaw = 0;
    }

    const moving = !this.paused && (this.mode === 'manual' || this.mode === 'navigating' || this.mode === 'docking');

    if (!dropping) {
      if (this.paused) {
        this.speed = 0;
      } else if (this.mode === 'manual') {
        this.headingDeg = normDeg(this.headingDeg + (this.commandedVyaw * JOY_MAX_YAW * (180 / Math.PI)) * dt);
        this.speed = this.commandedVx * JOY_MAX_SPEED;
        this.x = clamp(this.x + Math.cos((this.headingDeg * Math.PI) / 180) * this.speed * dt, 0.3, 29.7);
        this.y = clamp(this.y + Math.sin((this.headingDeg * Math.PI) / 180) * this.speed * dt, 0.3, 17.7);
      } else if ((this.mode === 'navigating' || this.mode === 'docking') && this.target) {
        const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
        if (dist < ARRIVE_DIST) {
          this.x = this.target.x;
          this.y = this.target.y;
          this.speed = 0;
          this.mode = 'idle';
          const poi = this.target.poiCode;
          this.target = null;
          this.onArrived?.(poi);
        } else {
          const want = normDeg((Math.atan2(this.target.y - this.y, this.target.x - this.x) * 180) / Math.PI);
          this.headingDeg = rotateToward(this.headingDeg, want, 90 * dt);
          this.speed = NAV_SPEED;
          this.x += Math.cos((this.headingDeg * Math.PI) / 180) * this.speed * dt;
          this.y += Math.sin((this.headingDeg * Math.PI) / 180) * this.speed * dt;
        }
      } else {
        this.speed = 0;
      }

      // estop: กลับ idle อัตโนมัติหลัง 5 วิ (หุ่นจริงต้องกด reset)
      if (this.mode === 'stopped' && this.stoppedSince && now - this.stoppedSince > 5000) {
        this.mode = 'idle';
        this.stoppedSince = null;
      }

      // แบต: หมดช้ากว่าจริง ~10x เพื่อให้เห็นผลในการ demo
      this.batteryPct = Math.max(0, this.batteryPct - dt * (moving ? 0.00002 * 10 : 0.000004 * 10));
      this.cpuPct = clamp(Math.round(20 + (moving ? 14 : 0) + Math.sin(now / 4000) * 5 + Math.random() * 3), 5, 95);
      this.wifiDbm = -52 - Math.round(Math.abs(Math.sin(now / 9000)) * 12 + Math.random() * 3);
      this.lastTelemetryAt = now;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** หมุนจาก from ไปหา to ไม่เกิน maxDeg (deg) */
function rotateToward(from: number, to: number, maxDeg: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  if (Math.abs(diff) <= maxDeg) return normDeg(to);
  return normDeg(from + Math.sign(diff) * maxDeg);
}
