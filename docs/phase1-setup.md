# ติดตั้งและตรวจรับระยะที่ 1

## สิ่งที่ต้องเตรียม

- Node.js และ pnpm 9
- PostgreSQL 16 หรือ Docker Compose
- หุ่น SLAMTEC Hermes Pro Max ที่เปิด REST API, ที่อยู่ IP ของหุ่น และแผนที่ SLAM (`.stcm`) ของอาคารจริง
- ผังห้อง, พิกัด POI และพิกัดแท่นชาร์จที่วัดในระบบพิกัดเดียวกับแผนที่ SLAM

REST API ใช้พอร์ต 1448 ตาม [คู่มือผู้ผลิต](https://wiki.slamtec.com/download/attachments/83066883/Slamware%20Restful%20API%20Development%20Manual%20V1.1.pdf?api=v2&modificationDate=1700531710357&version=1) คำสั่งที่โค้ดใช้เทียบกับ [OpenAPI ของ SLAMTEC](https://docs.slamtec.com/opt/swagger-conf.json)

## ฐานข้อมูล

1. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด `DB_MODE=pg`, `DATABASE_URL`, `INITIAL_ADMIN_PASSWORD` (อย่างน้อย 12 ตัวอักษร), `SESSION_SECRET` และ `KIOSK_TOKEN` (อย่างน้อย 32 ตัวอักษรใน production)
2. ถ้าใช้ Docker ให้รัน `docker compose up -d` หรือเตรียม PostgreSQL ภายนอกและแก้ `DATABASE_URL`
3. รัน `pnpm install`, `pnpm --filter @hermes/backend db:generate`, `pnpm --filter @hermes/backend db:migrate`
4. ตั้ง `ROBOT_MODE=hermes`, `HERMES_BASE_URL=http://<IP ของหุ่น>:1448` และเริ่มระบบด้วย `pnpm dev` ระหว่างตรวจรับ
5. คัดลอก `apps/kiosk/.env.example` เป็น `apps/kiosk/.env.local` แล้วตั้ง `API_URL` และ `KIOSK_TOKEN` ให้ตรงกับ Backend
6. คัดลอก `apps/admin/.env.example` เป็น `apps/admin/.env.local` แล้วตั้ง `NEXT_PUBLIC_API_URL` เป็น URL ของ Backend ที่เบราว์เซอร์ผู้ดูแลเข้าถึงได้ และตั้ง `CORS_ORIGIN` ของ Backend เป็น URL หน้า Admin

Backend สร้างบัญชี `admin` ครั้งแรกจาก `INITIAL_ADMIN_PASSWORD` และเริ่มโดยไม่มีแผนที่เผยแพร่ ไม่มีบัญชีทดลอง

## แผนที่จริง

เปิดหน้า **แผนที่** ด้วยบัญชี admin แล้วนำเข้า JSON รูปแบบนี้ โดยแทนค่าตัวอย่างทุกตำแหน่งด้วยค่าที่วัดจากอาคารจริง:

```json
{
  "name": "อาคารจริง ชั้น 1",
  "widthM": 20,
  "heightM": 12,
  "slamMapRef": "ชื่อไฟล์หรือรหัสแผนที่ .stcm ที่โหลดอยู่บนหุ่น",
  "rooms": [
    { "id": "lobby", "x": 1, "y": 1, "w": 5, "h": 5, "nameTh": "โถงต้อนรับ", "nameEn": "Lobby", "kind": "lobby" }
  ],
  "pois": [
    { "code": "DOCK", "nameTh": "แท่นชาร์จ", "nameEn": "Dock", "x": 2, "y": 2, "headingDeg": 0, "isPublic": false, "isDock": true, "sortOrder": 0 },
    { "code": "ROOM1", "nameTh": "ห้องตัวอย่าง", "nameEn": "Sample room", "x": 8, "y": 5, "headingDeg": 0, "isPublic": true, "isDock": false, "sortOrder": 1 }
  ],
  "keepouts": []
}
```

ตรวจว่าพิกัดและทิศทางตรงกับระบบพิกัดของหุ่นก่อนกดเผยแพร่ ระบบตรวจรูปแบบ JSON, ขอบแผนที่, จุดแท่นชาร์จ และ `slamMapRef` แต่ยังไม่สามารถตรวจว่าชื่อไฟล์อ้างอิงตรงกับแผนที่ที่หุ่นกำลังใช้อยู่ จึงต้องตรวจด้วยหุ่นจริงก่อนเปิดให้ Kiosk รับผู้มาเยือน

## ตรวจรับกับอุปกรณ์

1. ตรวจ `/api/robot/state` ในคอนโซลว่า `simulated=false`, `linkStatus=ok` และตำแหน่ง/แบตเตอรี่ตรงกับหุ่น
2. ตัดการเชื่อมต่อชั่วคราวเพื่อดู `stale` หลัง 2 วินาที และ `dead` หลัง 5 วินาที; เมื่อ `dead` ระบบต้องปฏิเสธคำสั่งเคลื่อนที่ใหม่
3. ทดสอบ lock ด้วยคอนโซลสองหน้าต่าง แล้วทดสอบจอยสติ๊กในพื้นที่ปลอดภัย คำสั่ง `MoveByAction` ของผู้ผลิตไม่มีการหลบสิ่งกีดขวาง
4. ทดสอบ E-Stop โดยมีเจ้าหน้าที่อยู่กับหุ่น ยืนยันการหยุดจริงและวิธีปลด E-Stop ตามคู่มือหุ่น
5. สั่งไป POI และกลับแท่นชาร์จ ยืนยันการถึงจุดจริง ผล action บนหน้า jobs และประวัติหลังรีสตาร์ต Backend
6. ตรวจจอ Kiosk ภาษาไทย/อังกฤษ การเลือกจุดสาธารณะ การนำทาง การยกเลิก และการคืนสถานะหลังรีเฟรช

ค่า `capturedAt` เป็นเวลาที่ Backend รับผล REST เพราะ endpoint ที่ใช้ไม่ได้ส่ง timestamp ต้นทาง จึงยังต้องวัดความหน่วงจริงกับหุ่นเพื่อยืนยัน NFR-02 ในสเปก ค่า Wi-Fi, CPU และ LiDAR แสดง `—` ในโหมด Hermes จนกว่าจะผูก endpoint ที่ให้ค่าจริงของเฟิร์มแวร์เครื่องนั้น

การเก็บข้อมูล PostgreSQL รุ่นนี้ทำงานกับ Backend หนึ่ง instance เท่านั้น หากไม่มีหุ่นจริง, แผนที่ SLAM จริง และ PostgreSQL ขั้นตอนตรวจรับข้างต้นยังไม่ถือว่าผ่าน แม้ build และ unit tests จะผ่าน
