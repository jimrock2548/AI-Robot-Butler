"""Progress briefing; uses existing drawing helpers without running the original deck."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
renderer=(ROOT/'scripts/build-project-slides.py').read_text(encoding='utf-8').split('\nnew(',1)[0]
renderer=renderer.replace("ROOT/'reports/presentation'", "ROOT/'reports/progress-presentation'")
renderer=renderer.replace(' / 18',' / 14').replace('AI ROBOT BUTLER  ·  PROJECT DRAFT','AI ROBOT BUTLER  ·  PROGRESS 13 OCT 2026')
exec(compile(renderer,str(ROOT/'scripts/build-project-slides.py'),'exec'))
prs.core_properties.title='AI Robot Butler — Progress Report — 13 October 2026'

new('รายงานความคืบหน้าโครงงาน','PROGRESS REPORT · 13 OCTOBER 2026',
    'แนะนำชื่อโครงงานและผู้จัดทำ รายงานครั้งนี้สรุปสถานะ ณ 13 ตุลาคม 2569 โดยใช้หลักฐานทดสอบเดิม เน้นความคืบหน้าซอฟต์แวร์ AI local และ Mock Test ที่เพิ่มล่าสุด ตอนนี้ยังไม่มีผลตรวจรับการเคลื่อนที่จริงจากผู้ช่วย เป้าหมายของการนำเสนอคือแยกสิ่งที่ทำแล้วออกจากสิ่งที่ต้องตรวจต่อ ไม่ประเมินเปอร์เซ็นต์รวมโดยไม่มีเกณฑ์ถ่วงน้ำหนัก',dark=True)
tx('AI ROBOT\nBUTLER',48,158,500,156,65,True,WHITE)
tx('เว็บพร้อม · AI local ทำแล้ว\nMock Test เพิ่มแล้ว · หุ่นจริงรอตรวจรับ',52,338,560,74,29,False,'AFC6CD')
tx('[กรอกชื่อผู้จัดทำ]  |  [กรอกอาจารย์ที่ปรึกษา]',52,441,670,31,22,False,'AFC6CD')
for y,big,label in [(157,'WEB','Admin + Kiosk'),(261,'AI LOCAL','กฎ + โมเดลบน PC'),(365,'MOCK TEST','จำลองว่าต่อหุ่นได้')]:box(649,y,250,87,big,label,LIGHT)

new('ภาพรวม: ซอฟต์แวร์ทำแล้ว แต่ยังรอตรวจรับหน้างาน','01 · OVERALL STATUS',
    'ระบบเว็บและฐานข้อมูลมีโค้ดและหลักฐานทดสอบแล้ว AI วิธีหนึ่งและสองพร้อม benchmark ใช้บน PC ได้ ส่วนงานควบคุมหุ่นมีเส้นทางรองรับแต่ต้องตรวจพฤติกรรมจริง การเลือกโหมดสำรวจยังเป็น preference ฝั่งเว็บ Jetson ระบบเสียง และบริบทถามกลับยังไม่พร้อมใช้งาน เราจึงไม่สรุปว่าโครงการเสร็จสำหรับหน้างานทั้งหมด','PROGRESS.md; docs/mock-robot.md')
card(48,153,272,269,'ทำแล้ว','เว็บ + AI + Mock','Admin / Kiosk / Backend\nฐานข้อมูลและระบบสิทธิ์\nAI วิธี 1–2 / Mock Test')
card(344,153,272,269,'รอตรวจรับ','หุ่นจริง','เดินถึง POI / กลับแท่น\nหยุดจริงและเครือข่ายหลุด\nPOI CRUD บนเครื่องจริง',accent=ORANGE)
card(640,153,272,269,'งานถัดไป','บริบท + อุปกรณ์','AI วิธีที่ 3\nโหมดสำรวจจริง\nJetson และ STT/TTS',accent=ORANGE)
strip('ทำได้ในโค้ด / Mock Test ≠ ยืนยันพฤติกรรมของหุ่นจริงแล้ว',fill='F9ECE3',ink=ORANGE)

new('สิ่งที่เพิ่มในรอบล่าสุด','02 · RECENT MILESTONES',
    'วันที่ 7 ตุลาคมขยายภาษา AI และเก็บผล benchmark วันที่ 11 เพิ่มตัวเลือกโหมดปกติ/สำรวจแบบออฟไลน์ วันที่ 12 จัดรูปเล่ม สไลด์ และเพิ่ม Mock Test แบบเชื่อมต่อหุ่น ผลทดสอบ backend หลังเพิ่ม mock ผ่าน 52 รายการ รายงานวันนี้จัดทำสไลด์ความคืบหน้า ไม่ได้ทดลองหุ่นหรือโมเดลใหม่','PROGRESS.md; reports/ai-benchmark/hybrid.json; reports/presentation/validation.json')
items=[('7 ต.ค.','AI หลายสำนวน + aliases + benchmark 40 กรณี'),('11 ต.ค.','เลือกโหมดปกติ / สำรวจบนเว็บตอนออฟไลน์'),('12 ต.ค.','รูปเล่มและสไลด์ฉบับร่าง พร้อมโน้ตช่วยพูด'),('12 ต.ค.','Mock Test: แผนที่สด LiDAR POI และนำทางจำลอง')]
for i,(date,body) in enumerate(items):
    y=151+i*77;rect(48,y,864,66,WHITE,LINE);tx(date,64,y+10,127,45,29,True,TEAL);tx(body,212,y+11,680,45,27)

new('โครงสร้างระบบที่พัฒนาแล้ว','03 · SYSTEM PROGRESS',
    'Admin และ Kiosk เรียก Backend กลาง Backend ตรวจสิทธิ์และงานก่อนเลือก adapter ของหุ่น ตอนนี้มีสามทาง: RobotSim เดิม หุ่น Hermes จริง และ MockHermesClient ที่เลียนแบบการเชื่อมต่อ โดย mock บังคับใช้ memory และไม่เรียก API ฮาร์ดแวร์จริง โมเดล local ยังเป็น Qwen จริงบนพีซีหากเปิดบริการ','config.ts; driver.ts; mockHermesClient.ts; chatService.ts')
box(48,171,221,102,'ADMIN','สถานะ / แผนที่ / ควบคุม')
box(48,333,221,102,'KIOSK','จุดหมาย / คำขอ AI')
box(350,224,259,171,'BACKEND','สิทธิ์ · งาน · บันทึก\nแผนที่ · กฎนำทาง\nแยกข้อมูลจริง / จำลอง',LIGHT,TEAL)
box(707,153,205,88,'HERMES จริง','อ่านจริงเคยผ่าน')
box(707,260,205,88,'MOCK TEST','Adapter local')
box(707,367,205,88,'QWEN บน PC','Structured intent')
arrow(269,219,348,269);arrow(269,382,348,344);arrow(609,260,705,197);arrow(609,309,705,304);arrow(609,362,705,411)

new('เว็บ แผนที่ และการจัดการจุดหมาย','04 · WEB & MAP',
    'เว็บผู้ดูแลและผู้ช่วยแยกกัน มีบทบาทผู้ใช้และ token ของ Kiosk ด้านแผนที่แสดงกริด หุ่น แท่น LiDAR และ POI ได้ รวมซูมและลาก ส่วน POI เพิ่ม แก้ ลบ และชื่อเรียกอื่นได้ มีการอ่านกลับยืนยัน แต่การตรวจ CRUD ทุกกรณีบนหุ่นจริงยังไม่ครบ หลักฐานอ่านข้อมูลจริงเป็นของรอบก่อน ไม่ใช่การเชื่อมต่อในขณะนำเสนอ','LiveRobotMap.tsx; RobotMapEditor.tsx; PROGRESS.md')
card(48,154,272,267,'WEB','สองเว็บไซต์','Admin สำหรับเจ้าหน้าที่\nKiosk สำหรับผู้มาเยือน\nมีสิทธิ์และเซสชัน')
card(344,154,272,267,'MAP','ข้อมูลต่อเนื่อง','SLAM grid / หุ่น / แท่น\nLiDAR / POI / เวลาอัปเดต\nซูมและลากแผนที่')
card(640,154,272,267,'POI','จัดการจุดหมาย','เพิ่ม · แก้ไข · ลบ\nชื่อเรียกอื่นใน aliases\nอ่านกลับตรวจสอบ')
strip('Mock แสดงหน้าตาแบบเชื่อมต่อ · ผลอ่านหุ่นจริงอ้างอิงรอบก่อน')

new('Mock Test: ดูหน้าตาแบบต่อหุ่นโดยไม่มีอุปกรณ์','05 · NEW MOCK TEST',
    'Mock Test เป็นความคืบหน้าใหม่ที่ช่วยพัฒนาต่อเมื่อไม่อยู่ใกล้หุ่น มี telemetry สด แผนที่กริด LiDAR 360 จุด home และ POI 4 จุด ใช้ UI เส้นทางแผนที่สดเดียวกับตอนต่อ Hermes ทุกหน้ามีป้ายข้อมูลจำลองที่เกี่ยวข้อง รองรับงานนำทางและควบคุมจำลอง ไม่จำลอง SLAM หรือการหลบสิ่งกีดขวางอย่างครบถ้วน','mockHermesClient.ts; mockConnected.test.ts; docs/mock-robot.md')
for x,value,label in [(48,'360','จุด LiDAR จำลอง'),(344,'4','POI พร้อมใช้งาน'),(640,'0','คำขอ API หุ่นจริง')]:
    rect(x,155,272,149,WHITE,LINE);tx(value,x+18,169,236,80,67,True,TEAL);tx(label,x+18,260,236,34,25)
tx('ลองบนเว็บได้',48,331,221,41,29,True)
tx('นำทาง · กลับแท่น · หยุด · joystick · POI CRUD\nแสดงการเปลี่ยนตำแหน่งและงานแบบจำลอง',282,335,630,82,26)
strip('ใช้ memory แยกจาก PostgreSQL · ปิด Backend แล้วข้อมูลทดลองหาย')

new('AI: วิธีที่ 1–2 ทำแล้ว วิธีที่ 3 ยังค้าง','06 · AI PROGRESS',
    'วิธีที่หนึ่งขยายกฎประโยคและชื่อเรียกอื่น วิธีที่สองใช้โมเดลตีความประโยคอ้อมเป็น JSON โดยเลือกรหัสจากรายการจริง ทั้งสองทำแล้วบน PC ส่วนวิธีที่สามคือจำคำถามที่ค้าง เช่น ห้อง A หรือ B แล้วนำคำตอบห้อง A ไปเชื่อมกับคำขอเดิม ตอนนี้มีข้อความถามกลับ แต่ยังไม่มีสถานะบทสนทนาเพื่อสร้างงานจากคำตอบต่อเนื่อง','robotLanguage.ts; robotIntent.ts; robotAiService.ts; PROGRESS.md')
card(48,154,272,267,'01 · ทำแล้ว','กฎและ aliases','รองรับคำขอหลายสำนวน\nจับชื่อ POI / ชื่อเรียกอื่น\nคำหยุดไม่รอโมเดล')
card(344,154,272,267,'02 · ทำแล้ว','โมเดลตีความ','ประโยคอ้อม → JSON\nตรวจ intent / UUID\nBackend คุมพิกัดและสิทธิ์')
card(640,154,272,267,'03 · ยังไม่เริ่ม','บริบทถามกลับ','“ห้อง A หรือ B?”\nตอบ “ห้อง A” แล้วเชื่อมงาน\nอ้าง “ที่นั่น” ข้ามข้อความ',accent=ORANGE)
strip('คำขอชัดเจนเดินได้เมื่อผ่านข้อกำหนด · ชื่อกำกวมถามใหม่')

results={name:json.loads((ROOT/f'reports/ai-benchmark/{name}.json').read_text(encoding='utf-8')) for name in ['baseline','hybrid','model']}
new('ผล benchmark AI ที่บันทึกไว้','07 · RECORDED RESULTS',
    'ชุด regression 40 กรณีที่ใช้พัฒนาผ่านเพิ่มจาก 21 เป็น 40 สำหรับ hybrid และ model เป็นหลัก ตัวชี้วัดเสนอเดินผิดเจตนา/จุดหมายลดจาก 4 เป็น 0 ในชุดนี้ ผลทั้งหมดบันทึกวันที่ 7 ตุลาคม ใช้ dry-run บน PC ไม่มีการเดินจริง และยังไม่ใช่ unseen evaluation หรือการรับประกันทุกประโยค','reports/ai-benchmark/{baseline,hybrid,model}.json — 7 October 2026')
for i,(name,label) in enumerate([('baseline','ก่อนปรับ'),('hybrid','กฎ + โมเดล'),('model','โมเดล + กฎป้องกัน')]):
    summary=results[name]['summary'];y=162+i*78
    tx(label,48,y,225,40,27,True);rect(285,y+6,418,27,SOFT,rounded=False);rect(285,y+6,418*summary['accuracyPct']/100,27,TEAL if name!='baseline' else '94A6AE',rounded=False)
    tx(f"{summary['passed']}/{summary['total']}",725,y-3,180,49,38,True,TEAL if name!='baseline' else MUTED)
tx('7 ต.ค. 2569 · PC / dry-run · ชุดที่ใช้พัฒนา ไม่ใช่ unseen test',48,369,864,30,20,False,MUTED)
strip('เสนอเดินผิดเจตนา/จุดหมายในชุดนี้: 4 → 0 กรณี',y=427)

new('ผลตรวจล่าสุดหลังเพิ่ม Mock Test','08 · SOFTWARE VERIFICATION',
    'หลังเพิ่ม Mock Test มี backend tests ผ่าน 52 รายการและ typecheck สามแอปผ่าน รวมการตรวจที่บังคับ memory แม้ตั้ง DB_MODE เป็น pg และดัก fetch เพื่อยืนยันว่าไม่เรียกเครือข่ายหุ่น smoke test ของระบบที่เปิดอยู่ตรวจแผนที่ Kiosk AI dry-run และเคลื่อนที่จำลองแล้ว ข้อมูลนี้เป็นผลเดิมล่าสุด ไม่ได้รันใหม่ขณะทำสไลด์วันนี้','PROGRESS.md; mockConnected.test.ts; check-robot-mock.mjs')
card(48,154,272,267,'52 TESTS','Backend ผ่าน','API / สิทธิ์ / งาน\nAI / แผนที่ / POI\nMock isolation / E-Stop')
card(344,154,272,267,'TYPECHECK','ผ่าน 3 แอป','Admin\nKiosk\nBackend')
card(640,154,272,267,'SMOKE TEST','เส้นทาง Mock ผ่าน','แผนที่ + LiDAR + Kiosk\nAI preview เลือก POI\nนำทางจำลองและยกเลิก')
strip('ผลตรวจซอฟต์แวร์และ Mock ไม่ใช่หลักฐานการเดินของหุ่นจริง',fill='F9ECE3',ink=ORANGE)

new('โหมดปกติ / สำรวจ: ฝั่งเว็บทำแล้ว','09 · MODE SELECTOR',
    'ผู้ควบคุมเลือกโหมดปกติหรือสำรวจได้แม้ออฟไลน์และจำตัวเลือกในเบราว์เซอร์ แต่การกดเลือกไม่ได้เปลี่ยน mappingEnabled ของหุ่น งานที่ยังค้างคือเชื่อม requested mode กับสถานะที่อุปกรณ์อ่านกลับยืนยัน ไม่เริ่มเดินหรือสำรวจอัตโนมัติเมื่อเชื่อมต่อใหม่ ในห้องแลปควรเริ่มตรวจแบบผู้ใช้บังคับเดินสร้างแผนที่ก่อนอัตโนมัติ','RobotOperatingMode.tsx; PROGRESS.md')
card(48,154,418,267,'ทำแล้ว','ตัวเลือกบนเว็บ','โหมดปกติ / โหมดสำรวจ\nเลือกขณะออฟไลน์ได้\nจำค่าเมื่อรีเฟรชหน้า')
card(494,154,418,267,'ยังค้าง','เปลี่ยนโหมดบนหุ่น','เชื่อม API จริง\nอ่านกลับยืนยันโหมด\nตรวจการสร้าง / จบแผนที่',accent=ORANGE)
strip('เลือกโหมด ≠ เปิด mapping หรือเริ่มเดินอัตโนมัติ',fill='F9ECE3',ink=ORANGE)

new('เอกสารส่งมอบที่มีแล้ว','10 · DELIVERABLES',
    'จัดรูปเล่มฉบับร่างหกบท Word และ PDF 38 หน้า มีแผนภาพสี่ภาพและตารางสิบห้าตาราง สไลด์ภาพรวมโครงการเดิมมีสิบแปดหน้าและโน้ตช่วยพูดครบ ส่วนชุดนี้เป็นรายงานความคืบหน้าเฉพาะรอบล่าสุด เอกสารยังต้องเติมชื่อบุคคล สถาบันและผลตรวจรับที่ยังไม่มี ไม่มีการแต่งผลทดลองฮาร์ดแวร์มาเติม','reports/project-documentation/validation.json; reports/presentation/validation.json')
card(48,154,418,267,'38 หน้า','รูปเล่มฉบับร่าง','Word แก้ไขได้ + PDF\n6 บท / แผนภาพ 4 ภาพ\nตาราง 15 ตาราง')
card(494,154,418,267,'18 สไลด์','สไลด์ภาพรวมโครงงาน','PowerPoint + PDF\nเนื้อหาหลักและข้อมูลสำรอง\nมีโน้ตช่วยพูดทุกหน้า')
strip('ก่อนส่ง: เติมชื่อผู้จัดทำ อาจารย์ สถาบัน และผลตรวจรับเมื่อมีหลักฐาน')

new('งานที่ยังค้าง เรียงตามลำดับเสนอทำต่อ','11 · NEXT STEPS',
    'แผนนี้เป็นลำดับที่เสนอ ไม่ใช่กำหนดวันหรือการอนุมัติให้เริ่มงานใหม่ หนึ่งเพิ่มบริบทถามกลับและ benchmark หลายข้อความ สองเชื่อมโหมดจริงและอ่านกลับยืนยัน สามตรวจรับการเดินและพฤติกรรมเครือข่ายในพื้นที่ที่ผู้ใช้ควบคุม สี่กลับไปทำ build และวัดโมเดล/เสียงบน Jetson ซึ่งพักตามคำขอ ยังไม่มีผล benchmark Jetson','PROGRESS.md; SPEC.md; docs/jetson-ai.md')
items=[('01','AI วิธีที่ 3','บริบทถามกลับ + benchmark หลายข้อความ'),('02','โหมดสำรวจจริง','เชื่อม API และยืนยันสถานะจากหุ่น'),('03','ตรวจรับฮาร์ดแวร์','ไป POI / หยุด / กลับแท่น / เครือข่ายหลุด'),('04','Jetson + เสียง','build / latency / RAM / STT / TTS')]
for i,(num,title,body) in enumerate(items):
    y=151+i*77;rect(48,y,864,66,WHITE,LINE);tx(num,65,y+10,61,41,29,True,TEAL);tx(title,145,y+10,261,41,29,True);tx(body,420,y+13,472,42,25)

new('แนวทางเดโมวันนี้: ใช้ Mock Test','12 · DEMO PLAN',
    'หากจะสาธิตใช้ Mock Test และตรวจป้ายก่อน แสดงหน้า Control ที่มีแผนที่ LiDAR และ POI แล้วเปิด Kiosk สั่งไป POI จำลองดูตำแหน่งและงานเปลี่ยน ทดลองหยุดหรือกลับแท่นเฉพาะตัวจำลอง เส้นทางเดโมในสไลด์เป็นขั้นตอนแนะนำ ไม่มีการเปิดบริการใหม่หรือส่งคำสั่งใดระหว่างสร้างสไลด์ การจำลองไม่ใช่การหลบสิ่งกีดขวางหรือ SLAM จริง','docs/mock-robot.md; scripts/start-robot-mock.ps1')
for i,(title,body) in enumerate([('ตรวจป้าย MOCK TEST','ยืนยันว่ากำลังใช้ข้อมูลจำลอง'),('ดูหน้าควบคุมและแผนที่','localhost:3000/control'),('เปิดเว็บผู้ช่วยและเลือก POI','localhost:3001/ai'),('ดูงานและตำแหน่งเปลี่ยน','ลองหยุด / กลับแท่นกับหุ่นจำลอง')]):
    y=151+i*77;rect(48,y,864,66,WHITE,LINE);tx(f'0{i+1}',65,y+10,61,41,29,True,TEAL);tx(title,145,y+10,364,43,27,True);tx(body,525,y+13,367,42,24)

new('พร้อมทดสอบซอฟต์แวร์ต่อ แม้ยังไม่มีหุ่น','13 · SUMMARY / Q&A',
    'สรุปว่าซอฟต์แวร์เว็บ AI local และ Mock Test มีหลักฐานตรวจแล้ว ทำให้พัฒนาต่อได้ตอนอุปกรณ์ไม่พร้อม ความเสี่ยงที่ยังต้องคลี่คลายคือการเดินจริง โหมดสำรวจจริงและการรันบน Jetson ถามกรรมการว่าควรให้ความสำคัญกับบริบทสนทนาหรือการตรวจรับอุปกรณ์ในรอบถัดไป และแจ้งว่าเปอร์เซ็นต์ benchmark ไม่ใช่เปอร์เซ็นต์โครงการเสร็จ',dark=True)
tx('เว็บ + AI local + Mock Test ทำแล้ว\nหุ่นจริง + Jetson + เสียง ยังต้องตรวจต่อ',52,166,850,122,40,True,WHITE)
tx('หลักฐานล่าสุด: 52 tests ผ่าน\nAI regression: 40/40 ในชุดทดสอบบน PC',52,314,850,89,31,False,'AFC6CD')
tx('ขอบคุณครับ / ค่ะ',52,431,535,44,34,True,WHITE);tx('Q & A',738,417,166,62,44,True,'72D3C5','right')

assert len(slides)==14
deck=OUT/'AI-Robot-Butler-Progress-2026-10-13.pptx';pdf_path=OUT/'AI-Robot-Butler-Progress-2026-10-13.pdf'
prs.save(deck);pdf.save(pdf_path,garbage=4,deflate=True)
notes=['# โน้ตนำเสนอความคืบหน้า — 13 ตุลาคม 2569','14 สไลด์ ประมาณ 8–12 นาที; เติมชื่อผู้จัดทำและอาจารย์ในหน้าแรก']
for slide in slides:notes.extend([f"## {slide['number']}. {slide['title']}",slide['notes'],'หลักฐาน: '+slide['source'] if slide['source'] else ''])
(OUT/'speaker-notes.md').write_text('\n\n'.join(notes)+'\n',encoding='utf-8')
(OUT/'slides-content.json').write_text(json.dumps(slides,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(deck) as z:assert z.testzip() is None
check=Presentation(deck);assert len(check.slides)==14
for slide in check.slides:
    assert slide.has_notes_slide
    for shape in slide.shapes:assert shape.left>=0 and shape.top>=0 and shape.left+shape.width<=prs.slide_width and shape.top+shape.height<=prs.slide_height
with pymupdf.open(pdf_path) as d:
    assert len(d)==14
    canvas=Image.new('RGB',(384*3,246*5),'#dde4e7');draw=ImageDraw.Draw(canvas)
    for i,p in enumerate(d):
        assert len(p.get_text().strip())>80
        pix=p.get_pixmap(matrix=pymupdf.Matrix(.4,.4));im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);x=i%3*384;y=i//3*246;canvas.paste(im,(x,y));draw.text((x+8,y+221),f'{i+1:02d}',fill='#142d3b')
        if i in [0,5,7,11]:p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(OUT/f'preview-{i+1:02d}.png')
    canvas.save(OUT/'contact-sheet.png')
manifest={'date':'2026-10-13','slides':14,'notes':14,'format':'16:9; editable native PowerPoint; vector PDF','textOverflow':0,'robotAccess':'none','testsRerunDuringSlideCreation':False,'benchmarkDate':'2026-10-07','sources':{str(path.relative_to(ROOT)):hashlib.sha256(path.read_bytes()).hexdigest() for path in [ROOT/'PROGRESS.md',ROOT/'docs/mock-robot.md',ROOT/'reports/ai-benchmark/hybrid.json']}}
(OUT/'validation.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'slides':14,'notes':14,'pptxBytes':deck.stat().st_size,'pdfBytes':pdf_path.stat().st_size},ensure_ascii=False))
