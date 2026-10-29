# ไมโครโฟนหน้า AI บน iPad

## เสียงอ่านคำตอบหลังไมค์ใช้งานได้แล้ว

ผู้ใช้ยืนยันว่ารับเสียงบน iPad ผ่าน HTTPS ได้แล้ว แต่ได้ยินเพียงเสียงเริ่มรับเสียงและยังไม่มีเสียงอ่านคำตอบ เพิ่มปุ่ม **เปิดเสียงตอบกลับ 🔊** บนหน้าใบหน้า ให้แตะก่อนเริ่มสนทนาหนึ่งครั้ง ปุ่มสั่ง SpeechSynthesis โดยตรงใน click handler หากคำตอบก่อนหน้าถูกบล็อกจะอ่านคำตอบนั้นซ้ำ ถ้ายังไม่มีคำตอบจะพูด “พร้อมตอบกลับด้วยเสียงแล้วครับ” จากนั้นคำตอบใหม่ยังอ่านอัตโนมัติตามตัวเลือกเดิม

[WebKit](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp) อาจไม่เริ่ม speech session บน iOS หากไม่ได้เริ่มจาก user gesture และอาจไม่ส่ง error จึงเพิ่มการรอ event เริ่มเสียง 5 วินาทีและปุ่ม retry แทนการแสดงว่าพูดอยู่ทั้งที่ยังไม่เริ่ม แยกข้อความเมื่อไม่อนุญาตเสียงกับไม่มีเสียงภาษาไทย การได้รับ onstart ยืนยันเพียงว่า engine เริ่มทำงาน ไม่ได้ยืนยันว่าผู้ใช้ได้ยินจากลำโพงจริง

ตรวจ browser fixture 6 กลุ่มผ่าน รวมการบล็อกเงียบ การแตะเริ่มอ่านคำตอบเดิม การอ่านคำตอบถัดไปครั้งเดียว ปิดเสียง ขาด voice และ not-allowed ไม่ส่งคำขอ Backend/หุ่น ยังต้องทดสอบเสียง iPad จริง [ผลตรวจ](../reports/ipad-speech-2026-10-29/browser.json)

จุดย้อนกลับก่อนแก้เสียงอ่านรอบนี้ (คง HTTPS และไมค์ไว้): `powershell -ExecutionPolicy Bypass -File scripts/rollback-ipad-mic.ps1 -Checkpoint ipad-speech-2026-10-29` ใช้ `-CheckOnly` เพื่อตรวจ hashes ก่อนย้อนจริง

แก้ฝั่งระบบวันที่ 29 ต.ค. 2569 และเก็บจุดย้อนกลับก่อนแก้ที่ `.tools/checkpoints/ipad-mic-2026-10-29/` ยังต้องยืนยันเสียงจาก iPad จริง

## เปิดใช้งานบน iPad ครั้งแรก

1. ต่อ Wi-Fi วงเดียวกับคอมพิวเตอร์ เปิด **Safari** แล้วเข้า `http://192.168.1.24:3001/hermes-lab-root.cer` เพื่อดาวน์โหลดใบรับรอง **Hermes Lab Local Root** ที่เครื่องนี้สร้างไว้
2. ไป **Settings → General → VPN & Device Management** เลือกโปรไฟล์ที่ดาวน์โหลดแล้วกดติดตั้ง
3. ไป **Settings → General → About → Certificate Trust Settings** เปิด **Full Trust** ให้ **Hermes Lab Local Root** เฉพาะใบนี้ การติดตั้งโปรไฟล์อย่างเดียวไม่ได้เปิดความเชื่อถือ SSL ตาม [คู่มือ Apple](https://support.apple.com/en-ca/102390)
4. เปิด `https://192.168.1.24:3443/ai` ต้องไม่มีคำเตือนใบรับรอง เปิดแผงแชต → ตั้งค่าและตรวจสอบเสียง → **ตรวจสิทธิ์ไมโครโฟน** แล้วอนุญาต จากนั้นกดพูด
5. หากไมค์เข้าถึงได้แต่ยังถอดเสียงไม่ได้ ตรวจว่าเปิด **Siri** ใน Settings และอนุญาตไมค์ในการตั้งค่าเว็บไซต์ Safari ตาม [ข้อกำหนด WebKit](https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/)

หากเบราว์เซอร์ไม่มี SpeechRecognition ใช้ Safari หรือแตะช่องพิมพ์แล้วใช้ไมค์บนแป้นพิมพ์ของ iPad แทนได้ การตรวจสิทธิ์ไมค์เพียงเปิดและปิด audio track ไม่ส่งข้อความ แต่ปุ่ม **กดพูด/ฟังคำเรียก** ยังคงส่งข้อความเมื่อพูดจบตามพฤติกรรมก่อนแก้

## เหตุผลและบริการ

`http://localhost` บนคอมพิวเตอร์ถือเป็น secure context แต่ HTTP ของ IP ใน LAN ไม่ใช่ จึงใช้ไมค์ไม่ได้ตาม [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) เพิ่ม HTTPS proxy พอร์ต 3443 สำหรับ Robot Interface ไปยังเว็บเดิมพอร์ต 3001 ไม่เผย API แอดมินที่พอร์ตนี้ และไม่เปิดสู่ public tunnel

เปิดบริการด้วย `powershell -ExecutionPolicy Bypass -File scripts/start-ipad-https.ps1` หรือ `scripts/start-robot-control.ps1 -Service https` หลังเปิดเว็บพอร์ต 3001 ตามปกติ หาก IP เครื่องเปลี่ยน สคริปต์เลือก LAN IP และสร้างใบรับรอง server ใหม่โดยเก็บ root เดิม อ่าน URL ปัจจุบันจาก `.tools/ipad-https/connection.json` ต้องใช้ IP ที่อยู่ในใบรับรอง

ใบรับรอง root แบบสาธารณะให้ดาวน์โหลดจากเว็บได้ แต่ private keys อยู่เฉพาะ `.tools/ipad-https/` และไม่อยู่ใน Git สคริปต์ไม่ติดตั้งใบรับรองลง trust store ของ Windows หรือ iPad อัตโนมัติ

## ผลตรวจและย้อนกลับ

Typecheck และ production build Robot Interface ผ่าน ตรวจ TLS chain/SAN IP ด้วย CA จริง, ดาวน์โหลด certificate, กัน API แอดมิน และ UI 8 กรณี: HTTP, ขอสิทธิ์ถูกปฏิเสธ, constructor/start error, คืน audio tracks หลังตรวจสิทธิ์, Siri/service unavailable, ส่งเสียงอัตโนมัติเดิม, wake word และ fallback เมื่อไม่มี SpeechRecognition ไม่มีคำขอถึงหุ่นหรือ Backend ใน browser test ทดสอบ UI ด้วยข้อมูลและเสียงจำลองบน Chrome ที่จำลอง user agent iPad ไม่ใช่ Safari/iPad จริง ผลอยู่ใน [รายงาน](../reports/ipad-mic-2026-10-29/browser.json)

ถ้าต้องย้อนเฉพาะการแก้รอบนี้:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/rollback-ipad-mic.ps1 -CheckOnly
powershell -ExecutionPolicy Bypass -File scripts/rollback-ipad-mic.ps1
```

สคริปต์ตรวจ SHA256 ของไฟล์สำรองและโค้ดหลังแก้ก่อนทำงาน หากมีคนแก้ไฟล์ต่อจะหยุดให้ตรวจทาน ไม่ทับงานใหม่ ปิดเฉพาะ proxy รอบนี้และคืนไฟล์ที่ระบุใน checkpoint ไม่ใช้ git reset และไม่คืนฐานข้อมูล/แผนที่หุ่น ไม่ลบ certificate ที่ผู้ใช้ติดตั้งบน iPad; ถ้าจะเลิกใช้ให้ลบโปรไฟล์ Hermes Lab Local Root ใน Settings ด้วยตนเอง
