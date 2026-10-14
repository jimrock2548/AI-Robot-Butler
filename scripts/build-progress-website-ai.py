"""Progress report split into Website and AI; preserves earlier presentations."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FULL_SOURCE=(ROOT/'scripts/build-progress-slides.py').read_text(encoding='utf-8')
prefix=FULL_SOURCE.split('\nnew(',1)[0].replace('reports/progress-presentation','reports/progress-website-ai').replace("' / 14'", "' / 15'")
exec(compile(prefix,str(ROOT/'scripts/build-progress-slides.py'),'exec'))
prs.core_properties.title='AI Robot Butler — Website & AI Progress — 13 October 2026'
blocks=['new('+part for part in FULL_SOURCE.split('\nnew(')[1:]]
blocks[-1]=blocks[-1].split('\nassert len(slides)',1)[0]
def existing(index,kicker):
    import ast
    block=blocks[index-1]
    first=ast.parse(block).body[0].value
    old=first.args[1].value
    exec(compile(block.replace(repr(old),repr(kicker),1),'<existing-slide>','exec'),globals())

existing(1,'PROGRESS REPORT · WEBSITE + AI · 13 OCT 2026')
new('ความคืบหน้าปัจจุบัน แยกเป็น 2 ฝั่ง','OVERVIEW · CURRENT STATUS',
    'เริ่มด้วยภาพรวมความคืบหน้า ก่อนลงรายละเอียดสองช่วง ฝั่ง Website มี Admin Kiosk Backend ฐานข้อมูล แผนที่และ Mock Test แล้ว แต่โหมดสำรวจจริงและการตรวจรับอุปกรณ์ยังค้าง ฝั่ง AI มี Qwen บน PC วิธีหนึ่งและสองพร้อม benchmark ส่วนบริบทนำทาง Jetson และเสียงยังไม่ได้ทำเสร็จ ไม่แสดงเปอร์เซ็นต์โครงการรวมโดยไม่มีเกณฑ์ถ่วงน้ำหนัก','PROGRESS.md; docs/mock-robot.md')
card(48,153,418,269,'ช่วงที่ 1 · WEBSITE','เว็บ + ระบบควบคุม','ทำแล้ว: Admin / Kiosk / Backend\nแผนที่ / POI / Mock Test\nยังค้าง: โหมดจริงและตรวจรับหุ่น')
card(494,153,418,269,'ช่วงที่ 2 · AI','คำสั่งภาษาธรรมชาติ','ทำแล้ว: AI local / วิธีที่ 1–2\nbenchmark regression 40/40\nยังค้าง: วิธีที่ 3 / Jetson / เสียง')
strip('สถานะตามหลักฐานที่มี · ยังไม่ใช่ผลตรวจรับการเคลื่อนที่จริง',fill='F9ECE3',ink=ORANGE)

new('ช่วงที่ 1 — ความคืบหน้าฝั่ง Website','PART 01 · WEBSITE',
    'เริ่มช่วง Website โดยสรุปเฉพาะความคืบหน้าที่ทำแล้วก่อน รายละเอียดในช่วงนี้มีหน้าเว็บ โครงสร้าง Backend แผนที่ POI Mock Test ตัวเลือกโหมดและผลตรวจระบบ จะปิดช่วงด้วยงานค้างฝั่งเว็บและการตรวจรับหุ่น แล้วค่อยเปลี่ยนไปช่วง AI',dark=True)
tx('Admin + Kiosk + Backend ทำแล้ว',52,171,850,68,44,True,WHITE)
tx('แผนที่สด · POI · ระบบสิทธิ์ · ฐานข้อมูล\nMock Test ใช้ดูหน้าตาแบบต่อหุ่นได้',52,274,850,99,34,False,'AFC6CD')
tx('ลำดับรายงาน: งานที่ทำแล้ว → ผลตรวจ → งานที่ยังค้าง',52,425,850,40,27,False,'AFC6CD')
existing(5,'WEBSITE · ADMIN / KIOSK / MAP / POI')
existing(4,'WEBSITE · BACKEND & INTEGRATION')
existing(6,'WEBSITE · MOCK TEST')
existing(10,'WEBSITE · MODE SELECTOR')
existing(9,'WEBSITE · SYSTEM VERIFICATION')
# Tests span both web and AI; do not present 52 as web-only tests.
tx('52 tests เป็นผลของระบบรวม: เว็บ + Backend + AI + Mock',48,129,864,28,19,False,MUTED)

new('ฝั่ง Website: งานที่ยังค้างหลังจากนี้','WEBSITE · REMAINING WORK',
    'ปิดช่วงเว็บด้วยงานที่ยังค้าง การเลือกโหมดทำแล้วแต่ยังไม่เปลี่ยน mapping ของหุ่น ต้องเชื่อม API และอ่านกลับยืนยัน ต้องตรวจ POI CRUD และการคงข้อมูลบนอุปกรณ์จริง และทดสอบนำทางหยุดกลับแท่นรวมเครือข่ายหลุด ไม่มีการอนุมัติเดินหรือทดลองอุปกรณ์จากการจัดสไลด์นี้','PROGRESS.md; RobotOperatingMode.tsx; docs/mock-robot.md')
card(48,154,272,267,'01 · โหมดจริง','เชื่อม API โหมด','เปลี่ยนโหมดบนหุ่น\nอ่านกลับเพื่อยืนยัน\nไม่เริ่มสำรวจอัตโนมัติ',accent=ORANGE)
card(344,154,272,267,'02 · ข้อมูลจริง','ตรวจรับ POI','เพิ่ม / แก้ / ลบบนหุ่น\nตรวจทิศและพิกัดจริง\nตรวจการคงข้อมูล',accent=ORANGE)
card(640,154,272,267,'03 · หน้างาน','ตรวจการควบคุม','นำทาง / หยุด / กลับแท่น\nเครือข่ายและหลายหน้าเว็บ\nมีผู้ควบคุมในพื้นที่',accent=ORANGE)
strip('ขณะอุปกรณ์ไม่พร้อม ใช้ Mock Test ทดสอบหน้าตาและการไหลของงาน')

new('ช่วงที่ 2 — ความคืบหน้าฝั่ง AI','PART 02 · AI',
    'เริ่มช่วง AI และแสดงสิ่งที่ทำแล้วบนพีซีก่อน: โมเดล local เชื่อมเว็บผู้ช่วย วิธีหนึ่งและสองทำแล้ว และมีผล benchmark การตีความคำสั่ง ส่วนวิธีสาม Jetson และระบบเสียงจะเป็นงานค้างท้ายช่วงนี้ เพื่อไม่ทำให้เข้าใจว่า AI ทั้งหมดทำเสร็จแล้ว',dark=True)
tx('AI local บน PC เชื่อมเว็บผู้ช่วยแล้ว',52,171,850,69,44,True,WHITE)
tx('กฎหลายสำนวน + ชื่อเรียก POI\nโมเดลตีความประโยคอ้อมเป็น JSON',52,275,850,99,35,False,'AFC6CD')
tx('ลำดับรายงาน: ความสามารถปัจจุบัน → ผลวัด → งานที่ยังค้าง',52,425,850,40,27,False,'AFC6CD')
existing(7,'AI · METHODS 1–3')

new('AI เชื่อมเว็บแล้ว: ข้อความ → เจตนา → งาน','AI · IMPLEMENTED FLOW',
    'เว็บผู้ช่วยส่งข้อความให้ Backend กฎหรือโมเดลเลือกเจตนาและรหัสจุดหมาย Backend ตรวจ speech act สิทธิ์ ความกำกวมและรายการ POI แล้วอ่านพิกัดใหม่ก่อนส่งงาน สามารถถามตำแหน่งสถานะและหยุดได้ โดยคำหยุดที่รองรับไม่รอโมเดล การถามกลับที่แสดงตอนนี้ยังไม่ได้จำคำตอบเป็นบริบทนำทางข้ามข้อความ','robotLanguage.ts; robotIntent.ts; robotAiService.ts')
for x,title,body in [(48,'ข้อความจากเว็บ','คำขอไทย / อังกฤษ'),(272,'ตีความเจตนา','กฎ หรือ Qwen'),(496,'ตรวจคำขอ','Schema / POI / สิทธิ์'),(720,'คืนผล / งาน','Preview หรือ dispatch')]:box(x,196,192,118,title,body,LIGHT if x==496 else WHITE)
for x in [240,464,688]:arrow(x,253,x+28,253)
tx('ตัวอย่างที่รองรับแล้ว',48,347,301,42,29,True)
tx('“ช่วยพาไปที่หน้าประตูหน่อย”\n“ไปส่งที่ทางเข้าได้ไหมครับ”',368,345,535,81,28)
strip('AI เสนอรหัส POI · Backend ถือพิกัดและตรวจเงื่อนไขก่อนส่งงาน')
existing(8,'AI · RECORDED BENCHMARK')

new('ฝั่ง AI: งานที่ยังค้างหลังจากนี้','AI · REMAINING WORK',
    'วิธีสามต้องเก็บคำถามที่ค้างและรองรับที่นั่นอย่างมีบริบท จำกัดอายุและป้องกันงานซ้ำ พร้อม benchmark หลายข้อความ ส่วน Jetson เตรียม source/model แล้วแต่ build พัก ไม่มี server และยังไม่วัด latency หรือ RAM บนอุปกรณ์ ระบบ STT/TTS ยังไม่เปิดใช้ ผลพีซีไม่ใช้แทนผล Jetson','PROGRESS.md; SPEC.md; docs/jetson-ai.md')
card(48,154,272,267,'01 · วิธีที่ 3','บริบทสนทนา','เชื่อมคำตอบกับคำถามเดิม\nหมดอายุ / ยกเลิก / กันซ้ำ\nbenchmark หลายข้อความ',accent=ORANGE)
card(344,154,272,267,'02 · Jetson','ย้ายและวัดผล','เริ่ม build ที่พักไว้\nวัด latency และ RAM\nเลือกโมเดลจากผลจริง',accent=ORANGE)
card(640,154,272,267,'03 · เสียง','STT / TTS','รับเสียงและอ่านข้อความ\nวัดคุณภาพและความหน่วง\nตรวจบนอุปกรณ์ปลายทาง',accent=ORANGE)
strip('ทำวิธีที่ 3 และชุดทดสอบบน PC ได้ก่อน โดยไม่ต้องเชื่อมต่อหุ่น')

new('สรุปความคืบหน้า Website และ AI','SUMMARY · Q&A',
    'สรุปสองช่วง: Website มี UI Backend แผนที่ POI และ Mock Test พร้อมตรวจซอฟต์แวร์แล้ว ส่วน AI วิธีหนึ่งและสองทำแล้วบนพีซีและผ่าน regression 40 กรณีในชุดพัฒนา ขอบเขตที่ยังค้างคือการตรวจรับหุ่นจริง โหมดสำรวจจริง บริบทคำสั่ง Jetson และเสียง เปิดรับคำถามโดยอ้างหลักฐานและไม่สรุปความพร้อมฮาร์ดแวร์เกินที่ตรวจไว้',dark=True)
tx('WEBSITE',52,171,410,51,38,True,'72D3C5');tx('AI',511,171,400,51,38,True,'72D3C5')
tx('เว็บ / แผนที่ / POI / Mock ทำแล้ว\nโหมดจริงและหน้างานรอตรวจรับ',52,248,410,98,30,False,WHITE)
tx('AI วิธี 1–2 บน PC ทำแล้ว\nวิธี 3 / Jetson / เสียงยังค้าง',511,248,400,98,30,False,WHITE)
tx('52 tests ระบบรวม · AI regression 40/40 · ใช้หลักฐานเดิม',52,389,851,43,27,False,'AFC6CD')
tx('ขอบคุณครับ / ค่ะ',52,443,510,35,29,True,WHITE);tx('Q & A',767,429,137,53,36,True,'72D3C5','right')

assert len(slides)==15
deck=OUT/'AI-Robot-Butler-Progress-Website-AI.pptx';pdf_path=OUT/'AI-Robot-Butler-Progress-Website-AI.pdf'
prs.save(deck);pdf.save(pdf_path,garbage=4,deflate=True)
notes=['# ความคืบหน้า 2 ช่วง: Website / AI','15 สไลด์ ประมาณ 8–12 นาที; ภาพรวม 1–2, Website 3–9, AI 10–14, สรุป 15']
for s in slides:notes.extend([f"## {s['number']}. {s['title']}",s['notes'],'หลักฐาน: '+s['source'] if s['source'] else ''])
(OUT/'speaker-notes.md').write_text('\n\n'.join(notes)+'\n',encoding='utf-8')
(OUT/'slides-content.json').write_text(json.dumps(slides,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(deck) as z:assert z.testzip() is None
check=Presentation(deck);assert len(check.slides)==15
for s in check.slides:
    assert s.has_notes_slide
    for shape in s.shapes:assert shape.left>=0 and shape.top>=0 and shape.left+shape.width<=prs.slide_width and shape.top+shape.height<=prs.slide_height
with pymupdf.open(pdf_path) as d:
    assert len(d)==15
    canvas=Image.new('RGB',(384*3,246*5),'#dde4e7');draw=ImageDraw.Draw(canvas)
    for i,p in enumerate(d):
        assert len(p.get_text().strip())>80
        pix=p.get_pixmap(matrix=pymupdf.Matrix(.4,.4));im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);x=i%3*384;y=i//3*246;canvas.paste(im,(x,y));draw.text((x+8,y+221),f'{i+1:02d}',fill='#142d3b')
        if i in [1,2,8,9,13,14]:p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(OUT/f'preview-{i+1:02d}.png')
    canvas.save(OUT/'contact-sheet.png')
(OUT/'validation.json').write_text(json.dumps({'date':'2026-10-13','slides':15,'speakerNotes':15,'sections':{'overview':[1,2],'website':[3,9],'ai':[10,14],'summary':[15]},'textOverflow':0,'robotAccess':'none','modelAccess':'none','testsRerun':False},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'slides':15,'pptxBytes':deck.stat().st_size,'pdfBytes':pdf_path.stat().st_size}))
