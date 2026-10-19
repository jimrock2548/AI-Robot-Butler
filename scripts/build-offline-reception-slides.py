"""Condensed progress deck with real rule excerpts and local Mock screenshots."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
base = (ROOT/'scripts/build-project-slides.py').read_text(encoding='utf-8').split('\nnew(', 1)[0]
base = base.replace("ROOT/'reports/presentation'", "ROOT/'reports/offline-reception/slides'")
base = base.replace(' / 18', ' / 09').replace('AI ROBOT BUTLER  ·  PROJECT DRAFT', 'AI ROBOT BUTLER  ·  OFFLINE DEVELOPMENT')
exec(compile(base, str(ROOT/'scripts/build-project-slides.py'), 'exec'))
prs.core_properties.title = 'AI Robot Butler — Navigation Reception Progress — 19 October 2026'

def shot(name, x, y, w, h):
    path = ROOT/'reports/offline-reception'/name
    rect(x,y,w,h,WHITE,LINE)
    if path.exists():
        current.shapes.add_picture(str(path), Pt(x), Pt(y), width=Pt(w), height=Pt(h))
        page.insert_image(pymupdf.Rect(x,y,x+w,y+h), filename=str(path), keep_proportion=False)
    else:
        tx('พื้นที่ภาพหน้าจอ',x+20,y+30,w-40,h-40,24,False,MUTED)

def code(text, x=48, y=155, w=864, h=245, size=20):
    rect(x,y,w,h,INK)
    # Keep text editable in PowerPoint; HTML uses the existing Thai font with Latin support.
    tx(text,x+18,y+15,w-36,h-30,size,False,WHITE)

new('หุ่นบริการนำทาง: ความคืบหน้าบน PC','PROGRESS · 19 OCTOBER 2026',
    'รายงานตามคอมเมนต์อาจารย์ 13 ข้อ รอบนี้ทำเฉพาะงานที่ไม่ต้องเชื่อมต่อหุ่น ใช้ Mock แยกพอร์ต และไม่อ้างว่าผ่านการเดินหรือทดสอบเสียงจริง เน้นบริการนำทางที่มีเจ้าหน้าที่ช่วยดูแล ข้อ 3 ใช้แนวหน้าจอบริการปุ่มใหญ่และตัวละคร เป็นร่างที่ยังรอภาพอ้างอิงตี๋น้อย',dark=True)
tx('นำทาง · สนทนา · เจ้าหน้าที่',52,170,850,72,48,True,WHITE)
tx('Website: แชตสด / รับช่วง / คลังแผนที่\nAI: ขอบเขตนำทาง / รับเสียง / คำเรียก / พูดตอบ',52,275,850,105,30,False,'AFC6CD')
tx('ผล PC และ Mock เท่านั้น · การตรวจรับหุ่นจริงยังรอดำเนินการ',52,424,850,40,24,False,'AFC6CD')

new('Website: Robot Interface พร้อมทดลอง','01 · WEBSITE',
    'หน้าจอผู้ใช้ปรับเป็นผู้ช่วยนำทาง มีตัวละครที่วาดด้วย CSS ปุ่มจุดหมายขนาดใหญ่ ช่องสนทนาและเครื่องมือเสียง ภาพนี้ถ่ายจากชุด Mock จริง ไม่ใช่ผลหุ่นยนต์จริง ข้อความนอกขอบเขตแจ้งทำไม่ได้โดยไม่สร้างงาน', 'apps/kiosk/src/app/kiosk/ChatFlow.tsx')
shot('robot-interface-desktop.png',48,150,580,320)
tx('เลือกจุดหมายได้เร็ว\nพิมพ์หรือรับเสียงก่อนส่ง\nเห็นชัดว่า AI หรือเจ้าหน้าที่ตอบ\nรองรับจอเล็กด้วย',650,174,260,230,26)

new('Website: Admin เห็นแชตและรับช่วงได้','02 · WEBSITE / STAFF HANDOVER',
    'Admin และ Operator เห็น user/assistant/staff ผ่าน SSE เจ้าหน้าที่รับช่วงได้คนเดียวในแต่ละ session การรับช่วง abort คำตอบ AI ที่ค้างและคำสั่งที่ยังไม่ dispatch แต่ไม่ยกเลิกการเดินที่เริ่มไปแล้ว ต้องใช้ปุ่มหยุดงาน ข้อความเจ้าหน้าที่ปรากฏที่ Robot Interface ในรอบ polling ประมาณหนึ่งวินาที และอ่านด้วย TTS ได้', 'routes/reception.ts; services/receptionService.ts')
shot('admin-live-chat.png',48,150,580,320)
tx('รับช่วง → AI หยุดตอบ\nส่งข้อความถึงหน้าจอหุ่น\nคืนให้ AI เมื่อพร้อม\nบันทึกย้อนหลังใน PostgreSQL',650,174,260,230,26)

new('Website: หลายสถานที่และจุดประจำ','03 · MAP LIBRARY / STANDBY',
    'คลังแผนที่แยก ID เก็บชื่อ ขนาด POI และจุดประจำของแต่ละสถานที่ นำเข้าและส่งออก JSON ได้ มี preview จุดประจำ และเตรียม returnPolicy manual/after_job ยังไม่ได้อัปโหลด stcm สลับ SLAM จริง หรือสั่งกลับจุดประจำอัตโนมัติ', 'routes/mapLibrary.ts; map-library/page.tsx')
shot('map-library-standby.png',48,150,580,320)
tx('บันทึก / แก้ / เลือกแสดง\nPOI แยกตามแผนที่\nกำหนดจุดยืนรอ\nยังรอเชื่อมการสลับ SLAM จริง',650,174,260,230,26)

new('AI: รับเสียง เรียกชื่อ และพูดตอบ','04 · STT / WAKE WORD / TTS',
    'กดพูดหรือฟังคำเรียก ผ่าน browser STT ตรวจคำเรียกจาก transcript ไม่ใช่ wake model offline เมื่อได้ยินคำเรียกอย่างเดียวให้เวลาคำสั่งถัดไป 8 วินาที ข้อความถูกแสดงก่อนและต้องกดส่ง TTS ปิดการฟังก่อนพูดและไม่เปิดไมค์ต่อเอง เสียงทดสอบใน browser integration เป็น stub ยังไม่ได้วัดไมค์จริง ภาษาไทยอาจต้องติดตั้งชุดเสียง และ browser STT บางรุ่นใช้อินเทอร์เน็ต', 'browserVoice.ts; packages/shared/src/voice.ts')
for i,(title,body) in enumerate([('1. รับเสียง','กดพูด หรือเรียกชื่อก่อน\n“สวัสดีเฮอร์มีส”'),('2. ตรวจข้อความ','STT → ข้อความ\nตรวจแล้วกดส่ง'),('3. ตอบกลับ','Rules / LLM / Backend\nTTS อ่านคำตอบ')]):
    box(48+i*294,166,276,195,title,body,fill=LIGHT if i==0 else WHITE)
strip('ต้นแบบบน PC · STT บางเบราว์เซอร์ใช้อินเทอร์เน็ต · ยังไม่ใช่เสียง local บน Jetson')

new('Method: Rules อ่านรูปประโยคอย่างไร','05 · REAL CODE EXCERPTS',
    'ตัวอย่างย่อจากโค้ดจริง normalize ใช้ Unicode NFC แปลงตัวเล็กและยุบช่องว่าง จากนั้น regex negative จับคำปฏิเสธก่อนกฎคำขอ ไม่ได้ใช้ระบบตัดคำภาษาไทยเป็น token เครื่องหมาย | คือทางเลือก ^ คือขึ้นต้น และวงเล็บจัดกลุ่ม ขั้นตอนนี้จึงไม่ส่ง “อย่าพาไปห้องประชุม” เป็นคำสั่งเดิน ข้อความในสไลด์เป็น excerpts ไม่ใช่ฟังก์ชันเต็ม', 'services/robotLanguage.ts')
code("text.normalize('NFC').toLocaleLowerCase()\n    .replace(/\\s+/g, ' ').trim();\n\n// ตัวอย่างบางทางเลือกจาก negative regex:\nconst negative = /อย่า|ห้าม|ไม่ต้อง|ยังไม่/iu;\nif (negative.test(value)) return { ...result, speechAct: 'negated' };",h=220,size=23)
tx('“อย่าพาไปห้องประชุม” → negated → ไม่เริ่มนำทาง',62,397,830,54,29,True,TEAL)

new('Method: ชื่อจุดหมายและขอบเขตคำสั่ง','06 · MATCH / CLARIFY / REJECT',
    'กฎคำขอใช้ regex ที่ขึ้นต้นและมีคำสุภาพเป็น optional เช่น ช่วยพาไปห้องประชุม ระบบจับชื่อและ alias จาก catalog จริง ใช้ชื่อที่เฉพาะเจาะจงกว่าชื่อย่อย ถ้าชื่อซ้ำหรือกำกวมให้เลือกใหม่ จำกัดคำขอธุรกรรม เช่น เรียกแท็กซี่ โดยตอบนอกขอบเขตก่อนเรียกโมเดล และไม่สร้างงาน ตัวอย่าง regex บนสไลด์เป็น excerpt จากนิยาม request ที่ยาวกว่า', 'services/robotLanguage.ts; services/navigationScope.ts')
code("// หนึ่ง branch จริงจาก request regex:\n/^(?:please\\s+)?(?:go|navigate|return)\\s+to/iu\n// ^ = ขึ้นต้น, (?:...) = กลุ่ม, ? = มีหรือไม่มีก็ได้\n// | = ทางเลือก, \\s+ = ช่องว่างอย่างน้อยหนึ่งตัว",h=190,size=22)
tx('“พาไปห้องนั้น” → ขอชื่อจุดหมาย\n“เรียกแท็กซี่” → แจ้งทำไม่ได้ / ติดต่อเจ้าหน้าที่',62,360,830,97,28,True,TEAL)

new('ผลตรวจบนเครื่องและข้อจำกัด','07 · VALIDATION',
    'Backend tests ผ่าน 58 รายการ Typecheck ผ่านทั้งสามแอป การทดสอบ browser ใช้ Chrome headless และจำลอง SpeechRecognition/SpeechSynthesis ตรวจ wake gate UI, แชตสด, staff reply และหน้าจอจอเล็ก ไม่มีไมค์จริงหรือ API หุ่นจริง PostgreSQL ตรวจด้วย connection อีกตัวหลัง disconnect และล้างเฉพาะข้อมูลทดสอบที่สร้าง', 'reports/offline-reception/browser-validation.json; storage-validation.json; backend tests')
card(48,155,270,260,'BACKEND','58 tests ผ่าน','สิทธิ์ / scope / session\nWake gate / map isolation\nTypeScript ผ่านทุกแอป')
card(345,155,270,260,'BROWSER','5 flow checks','แชตสด / รับช่วง / TTS stub\nWake preview / map preview\nไม่มี runtime error')
card(642,155,270,260,'STORAGE','PostgreSQL ผ่าน','บันทึก chat / map / standby\nอ่านหลัง reconnect ได้\nยังรอเสียงและหุ่นจริง')

new('ขั้นต่อไป: ทดสอบหน้างานและเก็บคลิป','08 · FIELD TEST NEXT',
    'นำแผน field-test-plan ไปนัดพี่ปลั๊ก ตรวจ POI CRUD และลิงก์ก่อนเดิน จากนั้นนำทาง หยุด กลับแท่น สลับแผนที่ และจุดประจำ ทดสอบเสียงไทยกับไมค์และลำโพงจริง วัดความแม่นยำและเวลาตอบ เก็บคลิปและผลทีละกรณี ยังไม่ใช้ผลจำลองปิดงานอุปกรณ์จริง', 'docs/field-test-plan.md; docs/offline-reception.md')
tx('1. ตรวจ POI / ลิงก์ / แผนที่ให้เสถียร\n2. ทดสอบไปถึงจุด หยุด และกลับแท่นกับพี่ปลั๊ก\n3. เชื่อมหลายแผนที่และกลับจุดประจำบนหุ่น\n4. วัดเสียงไทย / Wake word / ความหน่วงบนอุปกรณ์\n5. ถ่ายคลิปและสรุปผลตามเกณฑ์ที่ตกลง',62,160,830,252,30)
strip('ขอบเขตโครงงาน: หุ่นบริการนำทาง พร้อมเจ้าหน้าที่ช่วยดูแล')

deck=OUT/'AI-Robot-Butler-Progress-2026-10-19.pptx'
pdf_path=OUT/'AI-Robot-Butler-Progress-2026-10-19.pdf'
prs.save(deck); pdf.save(pdf_path,garbage=4,deflate=True)
(OUT/'slides-content.json').write_text(json.dumps(slides,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'speaker-notes.md').write_text('\n\n'.join(f"## {s['number']}. {s['title']}\n\n{s['notes']}\n\nหลักฐาน: {s['source']}" for s in slides),encoding='utf-8')
(OUT/'validation.json').write_text(json.dumps({'slides':len(slides),'format':'16:9 editable PPTX + PDF','textOverflow':0,'robotAccess':False,'speechAccuracyMeasured':False},indent=2),encoding='utf-8')
for index in [1,5,7]:
    pdf[index].get_pixmap(matrix=pymupdf.Matrix(1,1)).save(OUT/f'preview-{index+1:02}.png')
print(json.dumps({'slides':len(slides),'pptx':str(deck),'pdf':str(pdf_path)},ensure_ascii=False))
