# คู่มือทดสอบ Reception บน PC

รอบพัฒนานี้แยกจากหุ่นจริง ใช้ Mock เท่านั้น

เปิด PowerShell 3 หน้าต่างจากโฟลเดอร์โปรเจกต์:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-offline-demo.ps1 -Service backend
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-offline-demo.ps1 -Service admin
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-offline-demo.ps1 -Service kiosk
```

- Robot Interface: http://localhost:3011/ai
- Admin แชตสด: http://localhost:3010/ai
- คลังแผนที่และจุดประจำ: http://localhost:3010/map-library
- บัญชีทดลอง: admin / admin123
- โหมด memory เก็บข้อมูลจนปิด Backend เท่านั้น ถ้าใช้ DB_MODE=pg ตาราง service_documents จะเก็บข้อมูลถาวร
- ประโยคกฎชัดเจนและการตอบนอกขอบเขตใช้ได้โดยไม่เปิด LLM; กรณีที่ต้องใช้โมเดลให้เปิด start-local-ai.ps1 แล้วเพิ่ม -LocalAI ตอนเริ่ม Backend

## ขอบเขตบริการ

AI_NAVIGATION_ONLY=true เป็นค่าปริยาย รองรับนำทาง POI ถามตำแหน่ง สถานะ และหยุด
คำถามกำกวมไม่อ้าง “ที่นั่น” ข้ามบทสนทนา ให้ผู้ใช้ระบุชื่อใหม่
คำขอเรียกแท็กซี่ จอง ซื้อ ชำระเงิน จะบอกว่าทำไม่ได้และไม่สร้างงาน
AI_NAVIGATION_ONLY=false ใช้ย้อนกลับโหมดสนทนาทั่วไปเดิม; ไม่ใช้ในการสาธิตบริการนำทางรอบนี้

## แชตและเจ้าหน้าที่

1. เปิด Robot Interface เริ่มบทสนทนา; ทุกครั้งที่เริ่มใหม่ได้ session ใหม่
2. Admin/Operator เปิด AI เพื่อดูข้อความ user/assistant/staff แบบสดผ่าน SSE
3. กด “รับช่วงสนทนา” จะยกเลิก inference ที่ค้าง เจ้าหน้าที่เป็นผู้ตอบคนเดียว
4. พิมพ์จาก Admin ข้อความปรากฏที่ Robot Interface ภายในรอบอัปเดตประมาณ 1 วินาที
5. กด “คืนให้ AI” เพื่อให้ข้อความถัดไปใช้ AI อีกครั้ง
6. การรับช่วงไม่ยกเลิกงานนำทางที่เริ่มไปแล้ว ใช้ปุ่มหยุดงานหากต้องการ

ผู้ใช้เห็นเฉพาะ session ที่มี capability token ของตน Viewer อ่านแชตใหม่ไม่ได้
เมื่อใช้ PostgreSQL บันทึก user ก่อนเริ่มตอบและบันทึกคำตอบเมื่อจบ/ยกเลิก หากโปรเซสตายกลางคำตอบ ข้อความส่วนที่ยังไม่บันทึกอาจหาย
แชตใหม่ยังไม่มีระบบลบ/กำหนดอายุอัตโนมัติ ควรกำหนดนโยบายก่อนนำไปใช้จริง

## เสียงบน PC

- “กดพูด”: รับเสียง → แสดงข้อความ → ผู้ใช้ตรวจและกดส่ง
- “ฟังคำเรียก”: ต้องขึ้นต้นด้วยคำเรียกที่ตั้งไว้ เช่น “สวัสดีเฮอร์มีส” ก่อนรับคำสั่ง
- หากเรียกชื่ออย่างเดียว ระบบรับคำสั่งถัดไปภายใน 8 วินาที หนึ่งคำสั่งต่อการเรียก
- ต้นแบบนี้เป็นการตรวจคำเรียกจากข้อความ STT ไม่ใช่โมเดล wake-word ที่รัน offline ตลอดเวลา
- การฟังเริ่มเมื่อผู้ใช้กดปุ่มและอนุญาตไมค์ เบราว์เซอร์หยุดฟังได้เอง ให้กดเริ่มใหม่
- “อ่านคำตอบ” เปิด TTS อัตโนมัติ หรือกดลำโพงเฉพาะข้อความ รวมข้อความเจ้าหน้าที่
- ขณะ TTS พูดจะปิดการรู้จำเสียง และไม่เริ่มฟังต่อเองเมื่อพูดจบ
- STT ใช้ Web Speech API ของเบราว์เซอร์ อาจส่งเสียงไปบริการภายนอก ต้องใช้อินเทอร์เน็ตในบางเบราว์เซอร์ และไม่รองรับทุกเครื่อง
- TTS ใช้เสียงที่มีในระบบ หากไม่มีเสียงไทยต้องติดตั้งชุดเสียงก่อน
- ยังไม่ใช่ STT/TTS local บน Jetson และยังไม่มีผลวัดความแม่นยำเสียงจริง

อ้างอิง: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition และ https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis

## หลายแผนที่และจุดประจำ

คลังแยกตาม ID ตั้งชื่อได้ นำเข้า/ส่งออก JSON แก้ไข และเลือกแสดงแผนที่พร้อม POI ของสถานที่นั้น
กำหนด standbyCode อ้างรหัส POI และ returnPolicy=manual หรือ after_job ได้
ปุ่มจำลองจุดประจำย้ายเฉพาะ marker บนภาพ preview ไม่ส่งคำสั่งหุ่น
ค่า after_job เป็นการเตรียมนโยบาย ยังไม่เรียกเดินกลับอัตโนมัติ
คลังนี้ยังไม่อัปโหลด .stcm ไม่สลับ active SLAM บนหุ่น และไม่แทนแผนที่ live

## PostgreSQL

มี migration ใหม่ 20261019_service_documents สำหรับ session/messages และคลังแผนที่
ก่อนเปิด Backend โหมด pg ให้อัปเดต Prisma Client และ apply migration โดยใช้ DATABASE_URL ของระบบนั้น:

```powershell
pnpm --filter @hermes/backend db:generate
pnpm --filter @hermes/backend db:migrate
```

Prisma CLI ต้องเห็น DATABASE_URL ใน environment; ไฟล์ .env ที่ root ไม่ถูกโหลดโดย CLI จาก apps/backend อัตโนมัติ

## ตรวจโค้ด

```powershell
pnpm typecheck
pnpm --filter @hermes/backend test
```
