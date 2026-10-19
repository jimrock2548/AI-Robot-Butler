# Hermes Reception Control

งานล่าสุด 19 ต.ค. 2569: [รายงานผล Reception บน PC](reports/offline-reception/REPORT.md) · [คู่มือเปิดชุดทดลอง Mock แยกพอร์ต](docs/offline-reception.md) · [แผน Field Test](docs/field-test-plan.md)

ระบบควบคุมหุ่นยนต์ต้อนรับตาม [SPEC.md](SPEC.md) ระยะที่ 1 มีเว็บผู้ดูแล, จอ Kiosk, Backend และ PostgreSQL พร้อมโหมดจำลองสำหรับพัฒนา

อ่าน [ภาพรวมระบบและสถานะงานทั้งหมด](docs/system-overview.md) เพื่อดูองค์ประกอบ การไหลของข้อมูล สิ่งที่ทำแล้ว และงานที่ยังค้างของทั้งระยะที่ 1 และระยะ AI

ดู [ความคืบหน้าล่าสุดและแผน Phase 2 — AI](PROGRESS.md) สำหรับสถานะงานที่ทดสอบแล้วและงานค้างก่อนตรวจรับกับหุ่นจริง

ทดลอง AI กับหุ่นจำลองบนเครื่องพัฒนาได้ตาม [docs/phase2-local-ai.md](docs/phase2-local-ai.md)

## เริ่มโหมดจำลอง

หากต้องการดูหน้าเว็บเหมือนเชื่อมต่อ Hermes พร้อมแผนที่สด LiDAR และ POI โดยไม่มีหุ่นจริง ใช้ [Mock Test แบบเชื่อมต่อหุ่น](docs/mock-robot.md) เริ่ม Backend ด้วย `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-robot-mock.ps1 -LocalAI` โหมดนี้แยกฐานข้อมูลในหน่วยความจำและไม่เรียก API หุ่นจริง

ต้องมี Node.js, pnpm 9 และติดตั้งแพ็กเกจด้วย `pnpm install` จากรากโปรเจ็กต์

1. คัดลอก `.env.example` เป็น `.env` แล้วใช้ `DB_MODE=memory` และ `ROBOT_MODE=sim`
2. ที่ `apps/kiosk` คัดลอก `.env.example` เป็น `.env.local` และตั้ง `KIOSK_TOKEN` ให้ตรงกับไฟล์ `.env` ของ Backend ถ้า Backend อยู่เครื่องอื่น ให้ตั้ง `NEXT_PUBLIC_API_URL` ใน `apps/admin/.env.local` จากตัวอย่างของ Admin ด้วย
3. รัน `pnpm dev` แล้วเปิดคอนโซลที่ `http://localhost:3000` และ Kiosk ที่ `http://localhost:3001/kiosk`
4. บัญชีทดลองในโหมดจำลอง: `admin/admin123`, `operator/operator123`, `viewer/viewer123`

ข้อมูลในโหมดจำลองหายเมื่อปิด Backend และแผนที่ตัวอย่างไม่ใช่แผนที่อาคารจริง

## ใช้ PostgreSQL และหุ่น Hermes จริง

ดูขั้นตอนเตรียมฐานข้อมูล, แผนที่ และตรวจรับกับหุ่นจริงที่ [docs/phase1-setup.md](docs/phase1-setup.md)

## ตรวจสอบโค้ด

```powershell
pnpm typecheck
pnpm --filter @hermes/backend test
pnpm build
```
