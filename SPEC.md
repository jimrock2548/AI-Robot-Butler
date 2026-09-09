# Hermes Reception Control — Software Specification

ระบบซอฟต์แวร์สำหรับหุ่นยนต์ต้อนรับอเนกประสงค์ บนแชสซี **SLAMTEC Hermes Pro Max**

| | |
|---|---|
| เวอร์ชันเอกสาร | 2.0 (รวมและแก้ข้อขัดแย้งจาก SRS v1 + ชุดออกแบบ UX/UI) |
| วันที่ | 9 กันยายน 2569 |
| สถานะ | พร้อมเริ่มพัฒนา Phase 1 |
| ขอบเขตเอกสารนี้ | **เว็บ 2 ตัว + Backend + Database** — ส่วน AI บน Jetson เลื่อนไป Phase 2 แต่กำหนด interface ไว้ล่วงหน้าแล้ว |

---

## 0. บันทึกการแก้ข้อขัดแย้ง

ก่อนหน้านี้ SRS ฉบับ PDF กับเอกสารออกแบบ (`PRODUCT.md` / `DESIGN.md`) ระบุไม่ตรงกันหลายจุด เอกสารนี้ตัดสินไปในทางเดียวแล้ว ดังนี้

| # | ข้อขัดแย้ง / ปัญหา | คำตัดสิน |
|---|---|---|
| C-1 | Database: SRS ระบุ **PostgreSQL** / เอกสารออกแบบระบุ **SQLite** | **ยึด PostgreSQL ตาม SRS** เหตุผล: telemetry เขียนถี่ + ต้องรองรับ operator หลายคนพร้อมกัน + ต้องใช้ `LISTEN/NOTIFY` และ `JSONB` |
| C-2 | SRS 1.2.2 REQ-02 ชื่อว่า "Speech to text" แต่คำอธิบายคือ "ระบบออกเสียง" (= TTS) และ **STT หายไปจากตาราง** ทั้งที่ REQ-01 ต้องใช้ | แยกเป็นสองข้อ: **RBT-02 = STT** (เสียง→ข้อความ) และ **RBT-03 = TTS** (ข้อความ→เสียง) |
| C-3 | Frontend: SRS ระบุ Next.js + TS + Tailwind + DaisyUI / ชุดออกแบบเป็น static HTML ที่มี design system ของตัวเอง | **ยึด Next.js ตาม SRS** ส่วน static HTML ถือเป็น **visual spec** ไม่ใช่โค้ดที่จะเอาไปใช้ต่อ ให้พอร์ต design token จาก `assets/wallet.css` เข้าเป็น Tailwind theme (§4.2) |
| C-4 | Backend: SRS ระบุ Node.js (Express) แยกจาก Next.js | **แยก 2 service จริง** Next.js ไม่ทำ business logic ใน API route ยกเว้น BFF/proxy บางๆ |
| C-5 | ฟีเจอร์ที่มีในชุดออกแบบแต่ **ไม่มีใน SRS** เลย: หยุดฉุกเฉิน, ระบบเวอร์ชันแผนที่, ประวัติงานนำทาง, สิทธิ์ผู้ใช้ 3 ระดับ | เพิ่มเข้า SRS แล้วเป็น **CON-08 ถึง CON-11** (§2.1) ไม่ถือเป็น scope creep อีกต่อไป |
| C-6 | SRS ไม่ระบุกลไก real-time ทั้งที่ REQ-02 บอกว่า "แสดงผลแบบ real time" | กำหนดเป็น **WebSocket (Socket.IO) + polling fallback** พร้อมนิยาม stale/dead (§5) |
| C-7 | SRS ไม่ระบุว่า manual กับ autonomous ห้ามทำงานพร้อมกันใน backend (ระบุแค่ระดับ UI) | กำหนด **state machine + control lock ฝั่ง server** เป็นแหล่งความจริงเดียว (§6) |
| C-8 | ตัวเลข "ตอบภายใน 1.9 วินาที" และค่า confidence ในชุดออกแบบ | เป็น **ข้อมูลสมมติ** ห้ามใช้อ้างอิง ต้องวัดจริงบนฮาร์ดแวร์ก่อน (§11) |
| C-9 | Non-Functional "โหลดข้อมูลเริ่มต้นภายใน 2 วินาที" ไม่ระบุว่านับจากอะไร | นิยามใหม่เป็น TTI ของหน้าแดชบอร์ดบน LAN (§3) |

---

## 1. ภาพรวมระบบ

ระบบประกอบด้วย 4 องค์ประกอบ

```
┌──────────────────────┐     ┌──────────────────────┐
│  Web Admin Console   │     │  Web Robot Interface │
│  Next.js (desktop)   │     │  Next.js (kiosk)     │
│  เจ้าหน้าที่ / ผู้ดูแล  │     │  ผู้มาเยือน · TH/EN   │
└──────────┬───────────┘     └──────────┬───────────┘
           │ REST + WebSocket           │
           └────────────┬───────────────┘
                        ▼
           ┌────────────────────────────┐
           │   Backend  Node.js/Express │
           │   Router→Controller→       │
           │   Service→Model            │
           │   • control lock           │
           │   • telemetry poller       │
           │   • job state machine      │
           └──────┬──────────────┬──────┘
                  │              │
        ┌─────────▼──────┐  ┌────▼─────────┐
        │  PostgreSQL    │  │ Hermes Pro   │
        │                │  │ Max REST     │
        └────────────────┘  │ :1448        │
                            └──────────────┘
                                   ▲
        ┌──────────────────────────┘
        │  Phase 2 เท่านั้น
   ┌────┴─────────────────┐
   │ Jetson Xavier NX 8GB │
   │ Qwen + STT + TTS     │
   │ narrow-command       │
   └──────────────────────┘
```

**หลักการสำคัญ** เบราว์เซอร์ **ไม่คุยกับหุ่นโดยตรง** ทุกคำสั่งผ่าน backend เสมอ เพราะ backend เป็นที่เดียวที่ถือ control lock, ตรวจสิทธิ์, และบันทึก audit log

### ผู้ใช้ 3 กลุ่ม

1. **ผู้มาเยือน** — ยืนอยู่หน้าหุ่นในล็อบบี้ อาจถือของ อาจไม่อ่านภาษาอังกฤษ อาจรีบ ต้องการรู้ว่าไปทางไหน หรือให้พาไป ปฏิสัมพันธ์วัดกันเป็นวินาที
2. **เจ้าหน้าที่ต้อนรับ (operator)** — นั่งโต๊ะ เปิดเบราว์เซอร์ดูหุ่นทั้งวัน ต้องรู้ว่าหุ่นยังมีชีวิตและทำตัวถูก เข้าไปคุมมือเมื่อหุ่นติด สั่งไปห้อง สั่งกลับแท่นชาร์จ
3. **ผู้ดูแลระบบ (admin)** — เจ้าของแผนที่และบัญชีผู้ใช้ งานไม่บ่อยแต่ผลกระทบสูง

---

## 2. Functional Requirements

### 2.1 Web Admin Console

| Req ID | ชื่อ | รายละเอียด | Priority | Phase |
|---|---|---|---|---|
| CON-01 | User Authentication | เข้าสู่ระบบ / สมัครใช้งาน บัญชีใหม่เริ่มต้นเป็น `viewer` จนกว่า admin จะเลื่อนสิทธิ์ | High | 1 |
| CON-02 | Data Dashboard | แสดงสถานะหุ่นแบบ real time: แบตเตอรี่, พิกัด, ทิศ, ความเร็ว, LiDAR, Wi-Fi, CPU, uptime, งานที่กำลังทำ, ตำแหน่งบนแผนที่ | High | 1 |
| CON-03 | Joystick Manual Control | ควบคุมหุ่นด้วยมือ 8 ทิศ + halt พร้อมเทียบความเร็วที่สั่งกับที่หุ่นรายงาน | High | 1 |
| CON-04 | Point Control (Autonomous) | เลือก POI แล้วสั่งหุ่นไป แสดงเส้นทางและ ETA | High | 1 |
| CON-05 | Return to Base / Docking | สั่งกลับแท่นชาร์จ และกลับอัตโนมัติเมื่อแบตต่ำกว่าเกณฑ์ | High | 1 |
| CON-06 | Map Editor | เพิ่ม/แก้/ลบ POI และเขตห้ามผ่านบนแผนที่ SLAM บันทึกเป็นฉบับร่าง เผยแพร่เป็นเวอร์ชันใหม่ | High | 1 |
| CON-07 | User Management | เพิ่ม/แก้/ลบ ผู้ใช้ และกำหนดสิทธิ์ | Low | 1 |
| **CON-08** | **Emergency Stop** | **ปุ่มหยุดฉุกเฉินเข้าถึงได้โดยไม่ต้องเลื่อนหน้าจอ ทุกหน้า ทุกสถานะ ยกเลิกงานที่ทำอยู่ทันทีและปลดล็อกการควบคุม** | **High** | **1** |
| **CON-09** | **Map Versioning** | **แผนที่มีเวอร์ชัน ฉบับร่างไม่มีผลกับหุ่นจนกว่าจะเผยแพร่ ย้อนกลับเวอร์ชันได้** | **High** | **1** |
| **CON-10** | **Job History & Audit** | **บันทึกงานนำทางทุกงาน ทั้งสำเร็จและถูกยกเลิก พร้อม event log ห้ามลบ** | **High** | **1** |
| **CON-11** | **Role-Based Access Control** | **3 ระดับ: `viewer` ดูอย่างเดียว / `operator` สั่งงานหุ่นได้ / `admin` จัดการแผนที่และผู้ใช้ได้** | **High** | **1** |

### 2.2 Web Robot Interface (จอบนตัวหุ่น)

| Req ID | ชื่อ | รายละเอียด | Priority | Phase |
|---|---|---|---|---|
| RBT-01 | Touch Destination Menu | เลือกปลายทางด้วยการแตะ แสดงเฉพาะ POI ที่เปิดให้ผู้มาเยือน | High | **1** |
| RBT-02 | Speech to Text (STT) | รับคำสั่งเสียง แปลงเป็นข้อความ | High | 2 |
| RBT-03 | Text to Speech (TTS) | ระบบออกเสียงพูดตอบ | Medium | 2 |
| RBT-04 | Escort Mode | แสดงเส้นทางและระยะที่เหลือขณะพาไป | High | 1 |
| RBT-05 | Bilingual TH/EN | สลับภาษาไทย/อังกฤษ ค่าเริ่มต้นเป็นไทย | High | 1 |
| RBT-06 | On-screen Stop | ปุ่มหยุดบนจอหุ่น เข้าถึงได้โดยไม่ต้องเลื่อน | High | 1 |

> **สำคัญ:** ทุกปลายทางต้องไปถึงได้ด้วย **การแตะ** ไม่ใช่แค่เสียง เพราะห้องเสียงดัง และบางคนไม่พูดกับเครื่อง ข้อนี้ทำให้ Phase 1 ใช้งานได้จริงแม้ยังไม่มี AI

### 2.3 AI (Phase 2 — Qwen บน Jetson Xavier NX 8GB)

| Req ID | ชื่อ | รายละเอียด | Priority |
|---|---|---|---|
| AI-01 | Narrow Command | จำกัด output ของโมเดลให้อยู่ในชุด intent ที่กำหนด และปลายทางต้องเป็น POI ที่มีอยู่จริงบนแผนที่เท่านั้น | High |
| AI-02 | Harness | ชั้นครอบโมเดล: ตรวจ confidence, ตรวจสิทธิ์ปลายทาง, ปฏิเสธและบันทึกเหตุผล | High |
| AI-03 | Tool Calling | เรียกฟังก์ชันเข้า backend API | High |

**ชุด intent ที่อนุญาต (ปิดตาย 6 ตัว)**

| intent | ความหมาย | เรียก API |
|---|---|---|
| `navigate_to` | พาไปยังจุดหมาย | `POST /jobs` |
| `where_is` | บอกตำแหน่งโดยไม่เคลื่อนที่ | `GET /pois/:code` |
| `answer_question` | ตอบจากข้อมูลอาคาร | `GET /facts/:key` |
| `check_in_visitor` | ลงทะเบียนผู้มาเยือน | `POST /visitors` |
| `call_reception` | เรียกเจ้าหน้าที่ | `POST /alerts` |
| `cancel_job` | หยุดการนำทางที่ทำอยู่ | `POST /jobs/:id/cancel` |

**กฎการปฏิเสธ** — ปฏิเสธเมื่อ: confidence ต่ำกว่าเกณฑ์ / ปลายทางไม่อยู่ในแผนที่เวอร์ชันที่เผยแพร่ / ปลายทางเป็น POI หวงห้าม (`is_public = false`) / มีงานอื่นทำงานอยู่และไม่ใช่ `cancel_job` — ทุกครั้งที่ปฏิเสธต้องบันทึกลง `ai_rejections` และแสดงในคอนโซล

**สิ่งที่ต้องทำใน Phase 1 เพื่อรองรับ Phase 2**

- ออกแบบ endpoint ทั้ง 6 ให้เสร็จและใช้งานได้จากคอนโซลก่อน — AI แค่มาเรียกทีหลัง
- สร้างตาราง `ai_conversations` และ `ai_rejections` ไว้เลย
- หน้า "ระบบ AI" ในคอนโซลสร้างไว้แต่แสดง empty state ว่ายังไม่เชื่อมต่อ

---

## 3. Non-Functional Requirements

| ID | หมวด | ข้อกำหนด | วิธีวัด |
|---|---|---|---|
| NFR-01 | Performance | หน้าแดชบอร์ดถึงสถานะใช้งานได้ (TTI) **ภายใน 2 วินาที** บน LAN | Lighthouse บนเครื่อง operator จริง |
| NFR-02 | Performance | ค่า telemetry บนหน้าจอ **ช้ากว่าความจริงไม่เกิน 1 วินาที** | เทียบ timestamp จาก Hermes |
| NFR-03 | Performance | คำสั่ง joystick จากกดปุ่มถึงหุ่นเริ่มขยับ **ไม่เกิน 300 ms** | วัดปลายทางถึงปลายทาง |
| NFR-04 | Security | รหัสผ่านเก็บด้วย **Argon2id** (หรือ bcrypt cost ≥ 12) ห้ามเก็บ plaintext ทุกกรณี | code review |
| NFR-05 | Security | Session ใช้ **httpOnly + SameSite=Strict cookie** ไม่เก็บ token ใน localStorage | code review |
| NFR-06 | Security | ทุกคำสั่งที่กระทบหุ่นต้องตรวจสิทธิ์ **ฝั่ง server** ไม่ใช่แค่ซ่อนปุ่ม | integration test |
| NFR-07 | Safety | หยุดฉุกเฉินต้องทำงานได้แม้ WebSocket หลุด (ยิงผ่าน REST ตรง) | manual test |
| NFR-08 | Reliability | ถ้าติดต่อหุ่นไม่ได้เกิน 5 วินาที ทุกค่าที่แสดงต้องเปลี่ยนเป็นสถานะ **stale** ห้ามค้างค่าเดิมไว้เฉยๆ | manual test |
| NFR-09 | Accessibility | ควบคุมด้วยคีย์บอร์ดได้ทั้งหมดรวมถึงจอยสติ๊ก, focus มองเห็นได้, สถานะไม่สื่อด้วยสีอย่างเดียว | axe + manual |
| NFR-10 | Compatibility | จอหุ่นต้องใช้งานได้ทั้ง 800×1280 และ 1080×1920 แนวตั้ง ห้าม layout ใดผูกกับความสูงพิกเซลตายตัว | manual test |
| NFR-11 | Auditability | ทุกคำสั่งที่ส่งถึงหุ่นบันทึก ผู้สั่ง เวลา และผลลัพธ์ | schema |

---

## 4. Technology Stack & Architecture

### 4.1 Stack (ตาม SRS)

| ชั้น | เทคโนโลยี |
|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind CSS + DaisyUI** |
| Backend | **Node.js + Express + TypeScript** |
| Database | **PostgreSQL 16** |
| ORM / Query | Prisma หรือ Kysely (เลือกอย่างใดอย่างหนึ่ง แนะนำ Prisma เพื่อความเร็วในการเริ่ม) |
| Real-time | Socket.IO |
| Auth | express-session + connect-pg-simple, Argon2id |
| Validation | Zod (ใช้ schema ร่วมกันทั้ง frontend/backend) |
| Robot | SLAMTEC Slamware REST API — พอร์ต **1448** |
| Dev | Git / GitHub, VS Code, Docker Compose (postgres + backend) |

### 4.2 Design Tokens → Tailwind theme

ชุดออกแบบใช้กฎ **สองสีหมึก** ซึ่งเป็นแกนของระบบและต้องรักษาไว้

| หมึก | ความหมาย | ค่า |
|---|---|---|
| Navy | ค่าที่คอนโซล **สั่ง** หุ่น | `#12285A` (hover `#1D3A78`, active `#0E2049`) |
| Purple/Carbon | ค่าที่หุ่น **รายงานกลับ** | `#5A4A7F` (soft `#7E6DA3`, bg `#F6F4FB`) |
| Red | หยุด ยกเลิก ปฏิเสธ **เท่านั้น** ห้ามใช้ตกแต่ง | `#C0182C` (bg `#FDF2F3`) |

```js
// tailwind.config.ts — theme.extend.colors
navy:   { DEFAULT:'#12285A', 2:'#1D3A78', deep:'#0E2049' },
carbon: { DEFAULT:'#5A4A7F', soft:'#7E6DA3', bg:'#F6F4FB' },
ink:    { DEFAULT:'#1B2432', 2:'#59657A', 3:'#5F6B7D' },
line:   { DEFAULT:'#E1E5EB', 2:'#CBD2DC', 3:'#AAB4C2' },
surface:{ DEFAULT:'#FFFFFF', 2:'#FAFBFC', 3:'#EEF1F5' },
bg:'#F4F6F8',
red:{DEFAULT:'#C0182C',bg:'#FDF2F3'},
green:{DEFAULT:'#157347',bg:'#F1F8F4'},
amber:{DEFAULT:'#8A5A00',bg:'#FDF6EA'},
```

**ฟอนต์** — `Archivo` (UI) + `Anuphan` (ไทย, fallback อัตโนมัติต่อ glyph) + `Courier Prime` (ค่าตัวเลขที่วัดได้เท่านั้น) `line-height` body 1.62 / heading 1.42 เพราะไทยต้องการที่ว่างสำหรับวรรณยุกต์และสระ

**radius `3px` ทั้งระบบ** — DaisyUI ให้ตั้ง `--rounded-btn: 3px; --rounded-box: 3px;`

**กฎที่ต้องบังคับด้วย type system** (ข้อนี้สำคัญมาก) — สร้าง component 2 ตัว

```tsx
<Commanded value={0.60} unit="m/s" />   // navy, Archivo 600
<Reported  value={0.28} unit="m/s" />   // carbon, Courier Prime 700, tabular
```

ในชุด HTML เดิมเป็นแค่ CSS class ที่คนเขียน markup ต้องจำเอง และมีที่หลุดจริง การทำเป็น component ทำให้ **render ค่าไม่ได้เลยถ้าไม่บอกว่ามาจากไหน**

### 4.3 Backend Pattern (ตาม SRS)

```
Router      → endpoint routing, middleware (auth, rate limit)
Controller  → รับ request, validate ด้วย Zod, เรียก service, ตอบกลับ
Service     → business logic: control lock, state machine, การคุยกับหุ่น
Model       → CRUD กับ PostgreSQL
```

โครงไดเรกทอรีที่แนะนำ

```
backend/src/
  routes/        auth.ts robot.ts jobs.ts map.ts users.ts ai.ts
  controllers/
  services/      robotService.ts  hermesClient.ts  lockService.ts
                 jobService.ts    mapService.ts    telemetryPoller.ts
  models/
  middleware/    requireAuth.ts requireRole.ts errorHandler.ts
  schemas/       zod schemas (แชร์กับ frontend ผ่าน package หรือ copy)
  ws/            socket.ts
```

`hermesClient.ts` คือ **ที่เดียว** ที่รู้จัก URL `http://<robot-ip>:1448` ส่วนอื่นห้ามเรียกตรง

---

## 5. Real-time Layer

### 5.1 กลไก

- Backend มี **telemetry poller ตัวเดียว** poll Hermes REST ทุก **500 ms** ไม่ว่าจะมี client กี่คน
- Broadcast ผ่าน Socket.IO ทุก **1000 ms** (หรือทันทีเมื่อ state เปลี่ยน)
- Frontend เชื่อมต่อ WebSocket ถ้าเชื่อมไม่ได้ ให้ fallback ไป `GET /api/robot/state` ทุก 2 วินาที และ **แสดงให้ผู้ใช้เห็นว่ากำลังใช้โหมดสำรอง**

### 5.2 Socket events

| ทิศทาง | event | payload |
|---|---|---|
| server→client | `telemetry` | ค่าสถานะทั้งชุด + `capturedAt` |
| server→client | `job:update` | `{ jobId, status, progress, remainingM, etaSec }` |
| server→client | `lock:changed` | `{ heldBy, userName, mode, expiresAt }` |
| server→client | `robot:link` | `{ status: 'ok' \| 'stale' \| 'dead', lastSeenAt }` |
| server→client | `map:published` | `{ version, publishedBy }` |
| client→server | `joystick` | `{ vx, vyaw }` ส่งได้เฉพาะผู้ถือ lock, throttle 10 Hz |

### 5.3 นิยามสถานะการเชื่อมต่อ (บังคับตาม NFR-08)

| สถานะ | เงื่อนไข | การแสดงผล |
|---|---|---|
| `ok` | ได้ค่าใหม่ภายใน 2 วินาที | ปกติ สีคาร์บอน |
| `stale` | ไม่ได้ค่าใหม่ 2–5 วินาที | สีอำพัน + แสดงอายุของค่า เช่น "ค่าเมื่อ 3 วิที่แล้ว" |
| `dead` | เกิน 5 วินาที | สีเทา + ขีดฆ่าค่า + แบนเนอร์ "ขาดการเชื่อมต่อกับหุ่นยนต์" + ปิดปุ่มสั่งงานทั้งหมดยกเว้นหยุดฉุกเฉิน |

**ห้ามค้างค่าเดิมไว้เฉยๆ เด็ดขาด** — operator ที่เห็นตัวเลขค้างจะเข้าใจว่าหุ่นยังทำงานปกติ

---

## 6. Robot Control State Machine (แก้ C-7)

### 6.1 สถานะ

```
        ┌─────────┐
        │  IDLE   │◄────────────────────┐
        └────┬────┘                     │
   manual ───┤├─── auto                 │
             │                          │
   ┌─────────▼──┐        ┌──────────────┴──┐
   │  MANUAL    │        │   NAVIGATING    │
   │ (ถือ lock) │        │  (มี job ทำงาน)  │
   └─────┬──────┘        └────┬───────┬────┘
         │                    │       │
         │ ปล่อย lock          │ สำเร็จ │ ยกเลิก/หยุด
         │                    ▼       ▼
         │              ┌──────────┐  ┌──────────┐
         └─────────────►│ ARRIVED  │  │ STOPPED  │
                        └────┬─────┘  └────┬─────┘
                             └─────────────┘
                                    │
                             ┌──────▼──────┐
                             │  DOCKING    │ (แบตต่ำ / สั่งกลับ)
                             └─────────────┘
                     E-STOP จากทุกสถานะ → STOPPED
```

### 6.2 กฎที่บังคับฝั่ง server

1. **MANUAL กับ NAVIGATING ห้ามเกิดพร้อมกัน** ตรวจใน `robotService` ไม่ใช่ใน UI
2. **Control lock** — มีแถวเดียวในตาราง `control_lock` ผู้ที่จะสั่งงานต้องถือ lock ก่อน
   - `POST /api/robot/lock` ขอถือ, TTL **30 วินาที** ต่ออายุด้วย heartbeat ทุก 10 วินาที
   - ถ้าเจ้าของหยุดส่ง heartbeat lock หลุดอัตโนมัติ
   - `admin` แย่ง lock ได้ แต่ต้องยืนยันและบันทึกลง audit log
   - operator คนอื่นเห็นชัดเจนว่า "กำลังถูกควบคุมโดย พิสิษฐ์"
3. **E-Stop ข้ามทุกกฎ** ใครก็ตามที่ล็อกอินแล้วกดได้ ไม่ต้องถือ lock ยิงตรงผ่าน REST ไม่ผ่าน WebSocket และบังคับปลด lock ทันที
4. **หนึ่ง job ต่อหนึ่งเวลา** ขอ job ใหม่ตอนมี job ทำงานอยู่ → `409 Conflict` พร้อมข้อมูล job เดิม

---

## 7. Database Schema (PostgreSQL)

```sql
-- ผู้ใช้และสิทธิ์ ────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('viewer','operator','admin');

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,          -- Argon2id
  role          user_role NOT NULL DEFAULT 'viewer',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (               -- connect-pg-simple
  sid    TEXT PRIMARY KEY,
  sess   JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

-- หุ่นยนต์ ──────────────────────────────────────────────────
CREATE TABLE robots (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,     -- 'HX-01'
  model       TEXT NOT NULL DEFAULT 'SLAMTEC Hermes Pro Max',
  base_url    TEXT NOT NULL,            -- 'http://192.168.1.50:1448'
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- แผนที่ + เวอร์ชัน (CON-09) ─────────────────────────────────
CREATE TYPE map_status AS ENUM ('draft','published','archived');

CREATE TABLE maps (
  id            BIGSERIAL PRIMARY KEY,
  robot_id      BIGINT NOT NULL REFERENCES robots(id),
  version       INT NOT NULL,
  status        map_status NOT NULL DEFAULT 'draft',
  name          TEXT NOT NULL,          -- 'อาคารอาคะระ ชั้น 1'
  width_m       NUMERIC(6,2) NOT NULL,
  height_m      NUMERIC(6,2) NOT NULL,
  geometry      JSONB NOT NULL,         -- rooms, corridor, walls, doors
  slam_map_ref  TEXT,                   -- ไฟล์ .stcm จาก Hermes
  created_by    BIGINT REFERENCES users(id),
  published_by  BIGINT REFERENCES users(id),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (robot_id, version)
);
-- มีแผนที่ published ได้แค่ 1 ต่อหุ่น 1 ตัว
CREATE UNIQUE INDEX one_published_map
  ON maps (robot_id) WHERE status = 'published';

CREATE TABLE pois (
  id          BIGSERIAL PRIMARY KEY,
  map_id      BIGINT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,            -- 'RCPT','101','SVR','DOCK'
  name_th     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  x           NUMERIC(8,3) NOT NULL,    -- เมตร ในกรอบพิกัดของ SLAM
  y           NUMERIC(8,3) NOT NULL,
  heading_deg NUMERIC(5,1),             -- ทิศที่หุ่นควรหันเมื่อถึง
  zone        TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,  -- false = หวงห้าม
  is_dock     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE (map_id, code)
);

CREATE TABLE keepout_zones (
  id       BIGSERIAL PRIMARY KEY,
  map_id   BIGINT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  polygon  JSONB NOT NULL              -- [[x,y],...]
);

-- งานนำทาง (CON-10) ─────────────────────────────────────────
CREATE TYPE job_source AS ENUM ('operator','kiosk_touch','kiosk_voice','auto');
CREATE TYPE job_status AS ENUM
  ('queued','navigating','arrived','cancelled','failed','stopped');

CREATE TABLE jobs (
  id             BIGSERIAL PRIMARY KEY,
  ref            TEXT UNIQUE NOT NULL,      -- 'HX-0412'
  robot_id       BIGINT NOT NULL REFERENCES robots(id),
  map_version    INT NOT NULL,              -- แผนที่เวอร์ชันที่ใช้ตอนสั่ง
  dest_poi_code  TEXT NOT NULL,
  dest_name      TEXT NOT NULL,             -- snapshot กันชื่อเปลี่ยนภายหลัง
  source         job_source NOT NULL,
  requested_by   BIGINT REFERENCES users(id),   -- NULL ถ้ามาจากผู้มาเยือน
  status         job_status NOT NULL DEFAULT 'queued',
  distance_m     NUMERIC(8,2),
  departed_at    TIMESTAMPTZ,
  arrived_at     TIMESTAMPTZ,
  cancel_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_recent ON jobs (robot_id, created_at DESC);

CREATE TABLE job_events (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind       TEXT NOT NULL,   -- 'requested','accepted','waypoint','blocked',
                              -- 'estop','arrived','cancelled'
  detail     JSONB
);

-- Telemetry ────────────────────────────────────────────────
-- เก็บแบบสรุปทุก 5 วินาที ไม่ใช่ทุก tick ไม่งั้นตารางบวมเร็วมาก
CREATE TABLE telemetry_samples (
  robot_id    BIGINT NOT NULL REFERENCES robots(id),
  at          TIMESTAMPTZ NOT NULL,
  battery_pct NUMERIC(5,2),
  x           NUMERIC(8,3),
  y           NUMERIC(8,3),
  heading_deg NUMERIC(5,1),
  speed_mps   NUMERIC(5,2),
  wifi_dbm    INT,
  cpu_pct     INT,
  PRIMARY KEY (robot_id, at)
);

-- Control lock (§6) ────────────────────────────────────────
CREATE TABLE control_lock (
  robot_id    BIGINT PRIMARY KEY REFERENCES robots(id),
  held_by     BIGINT NOT NULL REFERENCES users(id),
  mode        TEXT NOT NULL,          -- 'manual' | 'auto'
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Audit (NFR-11) ───────────────────────────────────────────
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    BIGINT REFERENCES users(id),
  action     TEXT NOT NULL,   -- 'robot.estop','map.publish','user.delete',...
  target     TEXT,
  detail     JSONB,
  ip         INET
);

-- Phase 2 เตรียมไว้ ────────────────────────────────────────
CREATE TABLE ai_conversations (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  lang       TEXT NOT NULL,
  transcript TEXT NOT NULL,
  intent     TEXT,
  confidence NUMERIC(4,3),
  job_id     BIGINT REFERENCES jobs(id),
  latency_ms INT
);

CREATE TABLE ai_rejections (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  transcript TEXT NOT NULL,
  reason     TEXT NOT NULL,   -- 'restricted_poi','below_threshold',
                              -- 'unknown_poi','job_in_progress'
  detail     JSONB
);
```

---

## 8. REST API

Base: `/api` — ทุก endpoint ตอบ JSON, error รูปแบบ `{ error: { code, message, detail? } }`

### 8.1 Auth (CON-01, CON-11)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/auth/register` | — | สร้างบัญชีเป็น `viewer` เสมอ |
| POST | `/auth/login` | — | ตั้ง session cookie, rate limit 5 ครั้ง/นาที/IP |
| POST | `/auth/logout` | any | |
| GET | `/auth/me` | any | ข้อมูลผู้ใช้ + สิทธิ์ปัจจุบัน |

### 8.2 Robot state & control (CON-02, 03, 05, 08)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/robot/state` | viewer+ | สถานะปัจจุบัน + `linkStatus` + `capturedAt` |
| POST | `/robot/lock` | operator+ | ขอถือ lock `{ mode }` → `409` ถ้ามีคนถืออยู่ |
| POST | `/robot/lock/heartbeat` | ผู้ถือ | ต่ออายุ 30 วินาที |
| DELETE | `/robot/lock` | ผู้ถือ / admin | ปล่อย หรือแย่ง (admin) |
| POST | `/robot/manual` | ผู้ถือ | `{ vx, vyaw }` — REST fallback ของ WebSocket |
| POST | `/robot/halt` | ผู้ถือ | หยุดขับเคลื่อน ไม่ยกเลิก job |
| **POST** | **`/robot/estop`** | **operator+** | **หยุดฉุกเฉิน ไม่ต้องถือ lock ยกเลิก job + ปลด lock** |
| POST | `/robot/dock` | operator+ | สั่งกลับแท่นชาร์จ |

### 8.3 Jobs (CON-04, CON-10)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/jobs` | operator+ / kiosk | `{ destPoiCode, source }` → `409` ถ้ามี job อยู่ |
| GET | `/jobs/current` | viewer+ | |
| POST | `/jobs/:id/cancel` | operator+ | `{ reason }` |
| GET | `/jobs` | viewer+ | filter: `status`, `source`, `from`, `to`, pagination |
| GET | `/jobs/:id` | viewer+ | พร้อม `job_events` |

### 8.4 Map (CON-06, CON-09)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/maps/published` | any | ใช้โดยจอหุ่นด้วย — กรอง `is_public` ออกให้อัตโนมัติ |
| GET | `/maps/draft` | admin | |
| POST | `/maps/draft` | admin | สร้างร่างจากเวอร์ชันที่เผยแพร่อยู่ |
| PUT | `/maps/draft/pois/:code` | admin | เพิ่ม/แก้ POI |
| DELETE | `/maps/draft/pois/:code` | admin | |
| PUT | `/maps/draft/keepouts` | admin | |
| POST | `/maps/draft/publish` | admin | เผยแพร่ → broadcast `map:published` |
| POST | `/maps/:version/rollback` | admin | |
| GET | `/maps/versions` | viewer+ | |
| GET | `/pois` | any | รายการ POI จากเวอร์ชันที่เผยแพร่ |

### 8.5 Users (CON-07)

| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/users` | admin |
| GET | `/users/:id` | admin หรือเจ้าของบัญชี |
| POST | `/users` | admin |
| PATCH | `/users/:id` | admin |
| DELETE | `/users/:id` | admin (ยืนยันสองครั้งฝั่ง UI, ห้ามลบตัวเอง) |

### 8.6 Kiosk (จอบนหุ่น — RBT)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/kiosk/destinations` | kiosk token | POI ที่ `is_public = true` เท่านั้น |
| POST | `/kiosk/escort` | kiosk token | `{ destPoiCode, lang }` → สร้าง job `source='kiosk_touch'` |
| GET | `/kiosk/session/:jobId` | kiosk token | ความคืบหน้าสำหรับหน้าจอนำทาง |
| POST | `/kiosk/cancel` | kiosk token | |

> จอหุ่นใช้ **device token** ไม่ใช่บัญชีผู้ใช้ และเข้าถึงได้เฉพาะ 4 endpoint นี้

### 8.7 AI (Phase 2 — กำหนด contract ไว้ก่อน)

| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/ai/intent` | รับ `{ transcript, lang }` คืน `{ intent, confidence, args }` — Phase 1 คืน `501 Not Implemented` |
| GET | `/ai/rejections` | รายการที่ถูกปฏิเสธ สำหรับหน้าคอนโซล |
| GET | `/ai/conversations` | ประวัติบทสนทนา |

---

## 9. หน้าจอที่ต้องสร้าง

### 9.1 Admin Console (Next.js, desktop)

| Route | หน้า | REQ | อ้างอิงโปรโตไทป์ |
|---|---|---|---|
| `/login` | เข้าสู่ระบบ / สมัคร | CON-01 | `console-login.html` |
| `/` | แดชบอร์ด | CON-02, 08 | `console-dashboard.html` |
| `/control` | ควบคุมหุ่นยนต์ | CON-03, 04, 05, 08 | `console-control.html` |
| `/jobs` | ประวัติงานนำทาง | CON-10 | `console-jobs.html` |
| `/map` | แก้ไขแผนที่ SLAM | CON-06, 09 | `console-map-editor.html` |
| `/users` | จัดการผู้ใช้งาน | CON-07, 11 | `console-users.html` |
| `/users/[id]` | รายละเอียดผู้ใช้ | CON-07 | `console-user-detail.html` |
| `/ai` | ระบบ AI (empty state ใน Phase 1) | AI-01..03 | `console-ai.html` |

**Layout ร่วม** — side nav 222px, header มีนาฬิกา + สถานะการเชื่อมต่อ, **ปุ่มหยุดฉุกเฉินอยู่ในหน้าจอแรกทุกหน้า**

Responsive: ≥1180px เต็ม / <1180px คอลัมน์เดียว / <900px nav ย่อเป็นแถบไอคอน 58px / <640px field เรียงเดี่ยว

### 9.2 Robot Kiosk (Next.js, แนวตั้ง)

`/kiosk` หน้าเดียว มี 7 ฉาก

| ฉาก | เนื้อหา | Phase |
|---|---|---|
| `idle` | หน้าหุ่น + คำเชิญชวน + ปุ่ม "เลือกห้อง" | 1 |
| `menu` | เมนูแตะเลือกปลายทาง (POI สาธารณะ) | 1 |
| `escort` | เส้นทาง + ระยะที่เหลือ + ปุ่มหยุด | 1 |
| `arrived` | ถึงที่หมาย + ปุ่มกลับหน้าแรก | 1 |
| `listen` | กำลังฟัง + waveform | 2 |
| `think` | กำลังตีความคำสั่ง | 2 |
| `answer` | คำตอบข้อความ + อ่านออกเสียง | 2 |

**การสเกล** — ห้ามผูกกับพิกเซล ใช้ container query

```css
.kiosk { container-type: size; }
/* หน่วยฐาน: จำกัดทั้งกว้างและสูง ไม่งั้นจอที่กว้างกว่า 9:16 จะทำให้ปุ่มโตแต่แผนที่หด */
--u: min(1cqi, 0.5625cqh);
/* ทุกขนาดเขียนเป็น calc(N * var(--u)) */
```

---

## 10. แผนการทำงาน

### Phase 1 — เว็บใช้งานได้จริงโดยไม่มี AI (เป้าหมายตอนนี้)

| Sprint | งาน | ผลลัพธ์ที่ตรวจได้ |
|---|---|---|
| 1 | ตั้ง repo, Docker Compose, PostgreSQL schema, Prisma, Express skeleton, auth + RBAC | สมัคร/ล็อกอินได้ สิทธิ์ทำงานถูก |
| 2 | `hermesClient` + telemetry poller + Socket.IO + สถานะ ok/stale/dead | เห็นค่าจริงจากหุ่นวิ่งบนหน้าจอ ดึงสาย LAN แล้วขึ้น dead ภายใน 5 วินาที |
| 3 | Design token → Tailwind, `<Commanded>`/`<Reported>`, layout ร่วม, แดชบอร์ด | แดชบอร์ดครบ CON-02 + NFR-01 |
| 4 | control lock + state machine + joystick + **E-Stop** | เปิดคอนโซล 2 หน้าต่างแล้วแย่งคุมไม่ได้ E-Stop ทำงานแม้ปิด WebSocket |
| 5 | plan renderer เป็น React component (`publicOnly`/`crop`/`editable`/`route`) | แผนผังเดียวใช้ได้ทั้งคอนโซลและจอหุ่น |
| 6 | POI navigation + docking + jobs + job events + หน้าประวัติ | สั่งไปห้อง ถึงจริง มีบันทึกครบ |
| 7 | Map editor + versioning + publish/rollback | แก้ร่างแล้วหุ่นยังใช้เวอร์ชันเก่าจนกดเผยแพร่ |
| 8 | User management + audit log | CON-07, CON-11, NFR-11 |
| 9 | Kiosk: idle / menu / escort / arrived + TH/EN + device token | ผู้มาเยือนแตะเลือกห้องแล้วหุ่นพาไปได้ **จบ Phase 1** |
| 10 | ทดสอบ, a11y, เก็บงาน, เอกสารติดตั้ง | |

### Phase 2 — AI บน Jetson

| ลำดับ | งาน |
|---|---|
| 1 | **Benchmark ก่อนสัญญาอะไรทั้งสิ้น** วัดแยก 3 ค่า: STT latency, LLM TTFT + tokens/s, TTS latency บน Jetson จริง |
| 2 | เลือกโมเดลตามผล benchmark (ตั้งต้นที่ Qwen2.5-3B-Instruct INT4) |
| 3 | เขียน harness: intent classification + confidence threshold + POI allowlist + rejection log |
| 4 | ต่อ tool calling เข้า `/api` ที่ทำไว้แล้วใน Phase 1 |
| 5 | เพิ่มฉาก listen / think / answer บนจอหุ่น |
| 6 | หน้าคอนโซล AI: บทสนทนา + รายการที่ถูกปฏิเสธ |

---

## 11. ความเสี่ยงที่ต้องจับตา

| # | ความเสี่ยง | ผลกระทบ | การรับมือ |
|---|---|---|---|
| R-1 | **Jetson Xavier NX 8GB ต้องแบก LLM + STT + TTS พร้อมกันบน shared memory** | Phase 2 อาจช้าเกินรับได้ ผู้มาเยือนเดินหนี | benchmark ก่อนเขียนโค้ด, เตรียมแผนสำรอง: ย้าย STT/TTS ขึ้น server หรือลดเป็นโมเดล 1.5B |
| R-2 | ตัวเลข 1.9 วินาที และคะแนน confidence ในโปรโตไทป์ **เป็นค่าสมมติ** | ถ้าเอาไปใส่ในรายงานจะกลายเป็นการอ้างข้อมูลเท็จ | ห้ามอ้างจนกว่าจะวัดจริง ทุกจุดต้องติดป้าย "ข้อมูลสมมติ" |
| R-3 | Slamware REST API เวอร์ชันจริงอาจไม่ตรงกับที่คาด | งาน Sprint 2 ค้าง | ทำ spike ทดสอบ API จริงก่อนเริ่ม Sprint 1 |
| R-4 | ยังไม่มีแผนที่ SLAM จริง ห้อง ชื่อคน ทั้งหมดเป็นเรื่องสมมติ | ต้องเปลี่ยนทั้งชุดก่อนใช้จริง | scan อาคารจริงด้วย Hermes ให้เสร็จก่อน Sprint 6 |
| R-5 | Wi-Fi ในอาคารหลุดระหว่างหุ่นกำลังพาคน | ผู้มาเยือนถูกทิ้งกลางทาง | หุ่นต้องมีพฤติกรรม fail-safe ของตัวเอง + จอแสดงข้อความอธิบาย + แจ้งเตือนคอนโซล |
| R-6 | ชื่อ "Hermes Reception Control" ยืมมาจากตัวหุ่น | อาจติดปัญหาเครื่องหมายการค้า | ตั้งชื่อซอฟต์แวร์ของตัวเองก่อนส่งงาน |

---

## 12. หลักการออกแบบที่ต้องรักษาไว้

1. **สถานะจริงของหุ่นห้ามเดาจาก UI** — ปุ่มที่กดบอกว่า *ขออะไรไป* ค่าที่แสดงบอกว่า *หุ่นรายงานอะไรกลับมา* เมื่อสองอย่างไม่ตรงกัน ความไม่ตรงกันนั่นแหละคือข้อมูล
2. **ทุกการทำงานอัตโนมัติต้องหยุดได้ในระยะเอื้อมเดียว** ทุกหน้า ทุกสถานะ
3. **ขอบเขตของ AI ต้องมองเห็นได้** ทั้งผู้มาเยือนและ operator ต้องเห็นว่าปลายทางมาจากรายการที่จำกัดและแก้ไขได้ — นี่คือข้อโต้แย้งเรื่องความปลอดภัย ไม่ใช่ข้อความปฏิเสธความรับผิด
4. **จอหุ่นเน้นเข้าใจเร็วกว่าความหนาแน่น คอนโซลเน้นความหนาแน่นกว่าการตกแต่ง**
5. **หน้าจอฝั่งผู้มาเยือนต้องไม่ต้องการความรู้ภาษาอังกฤษหรือความรู้เรื่องหุ่นยนต์**
6. **ข้อเท็จจริงหนึ่งอย่างมีแหล่งเดียว** ระยะทาง ETA จำนวน waypoint และ progress ของงานหนึ่ง คือการคำนวณครั้งเดียว ไม่ใช่สี่ string
7. **สีแดงสงวนไว้สำหรับหยุด ยกเลิก ปฏิเสธ เท่านั้น** ปุ่มลบในตารางเป็นสีปกติ และเปลี่ยนเป็นแดงเฉพาะตอนยืนยันครั้งที่สอง
8. **`ch` ห้ามใช้เป็นหน่วยวัดความกว้าง** เพราะฟอนต์ตัวแรกใน stack ไม่มี glyph ไทย ใช้ `em` หรือ `%` แทน
9. **วันที่และเวลาเป็นไทย พ.ศ.** และห้ามใช้ `<input type="date">` เพราะ render ตาม locale ของเบราว์เซอร์ ไม่ใช่ของระบบ — ใช้ select ของช่วงเวลาที่ตั้งชื่อไว้แทน
10. **ระบบไม่อธิบายการออกแบบของตัวเองอยู่ภายในตัวมันเอง** เหตุผลอยู่ในเอกสารนี้ ไม่ใช่ในย่อหน้าบนหน้าแดชบอร์ด
