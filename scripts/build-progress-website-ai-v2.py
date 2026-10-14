"""Detailed Website + AI progress deck; no hardware or model requests."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RENDER_SOURCE=(ROOT/'scripts/build-project-slides.py').read_text(encoding='utf-8').split('\nnew(',1)[0]
RENDER_SOURCE=RENDER_SOURCE.replace("ROOT/'reports/presentation'", "ROOT/'reports/progress-website-ai'").replace(' / 18',' / 19').replace('AI ROBOT BUTLER  ·  PROJECT DRAFT','AI ROBOT BUTLER  ·  WEBSITE + AI PROGRESS')
exec(compile(RENDER_SOURCE,str(ROOT/'scripts/build-project-slides.py'),'exec'))
prs.core_properties.title='AI Robot Butler — Website & AI Progress — Revised'
shutil.copyfile('C:/Windows/Fonts/consola.ttf',FONTS/'mono.ttf')
CSS+='@font-face{font-family:Code;src:url(mono.ttf)}'
code_records=[]
def codebox(text,x,y,w,h,filename,size=16):
    rect(x,y,w,h,INK)
    tx(filename,x+16,y+11,w-32,31,19,True,'72D3C5')
    shape=current.shapes.add_textbox(Pt(x+16),Pt(y+53),Pt(w-32),Pt(h-66));tf=shape.text_frame
    tf.word_wrap=False;tf.margin_left=tf.margin_right=tf.margin_top=tf.margin_bottom=0
    for i,line in enumerate(text.split('\n')):
        para=tf.paragraphs[0] if i==0 else tf.add_paragraph();para.text=line;para.font.name='Consolas';para.font.size=Pt(size);para.font.color.rgb=RGBColor.from_string(WHITE);para.line_spacing=1.15;para.space_after=Pt(0)
    markup='<div style="font-family:Code;font-size:'+str(size)+'pt;line-height:1.15;color:white;white-space:pre">'+html.escape(text)+'</div>'
    spare,_=page.insert_htmlbox(pymupdf.Rect(x+16,y+53,x+w-16,y+h-13),markup,css=CSS,archive=archive,scale_low=1)
    if spare<0:raise ValueError('Code overflow: '+filename)
    slides[-1]['text'].append(text);code_records.append({'slide':len(slides),'source':filename,'display':'excerpt, reformatted; not a complete standalone function','code':text})
def screenshot_slot(x,y,w,h,label):
    rect(x,y,w,h,SOFT,LINE)
    tx(label,x+13,y+25,w-26,40,25,True,MUTED,'center')
    tx('พื้นที่สำหรับใส่ภาพหน้าจอเอง',x+13,y+75,w-26,29,19,False,MUTED,'center')

new('รายงานความคืบหน้า Website และ AI','PROGRESS REPORT · 13 OCTOBER 2026',
    'แนะนำโครงงานและผู้จัดทำ รายงานแบ่งสองช่วงคือ Website และ AI โดยเริ่มจากความคืบหน้าปัจจุบันก่อนงานค้าง เว็บไซต์สำหรับผู้ใช้หุ่นเรียกว่า Robot Interface ในสไลด์ชุดนี้ มีช่องภาพให้ผู้จัดทำเติมเองและตัวอย่างโค้ดที่ย่อจากโค้ดจริง ไม่มีการทดลองหุ่นหรือโมเดลใหม่ระหว่างจัดทำ',dark=True)
tx('AI ROBOT\nBUTLER',48,158,500,156,65,True,WHITE)
tx('Website: Admin + Robot Interface\nAI: กฎภาษา + โมเดล local + ตรวจคำสั่ง',52,338,650,79,29,False,'AFC6CD')
tx('[กรอกชื่อผู้จัดทำ]  |  [กรอกอาจารย์ที่ปรึกษา]',52,442,700,30,22,False,'AFC6CD')
box(714,169,185,115,'WEBSITE','ข้อมูล / ควบคุม',LIGHT)
box(714,322,185,115,'AI','ตีความ / เลือก POI',LIGHT)

new('ความคืบหน้าปัจจุบัน แยกเป็น 2 ฝั่ง','OVERVIEW · CURRENT STATUS',
    'Website มีสองหน้าใช้งาน Backend และฐานข้อมูล แสดงแผนที่จัดการ POI และมีคำสั่งควบคุมแล้ว งานที่ยังค้างคือเส้นทางอัปโหลดแผนที่ แก้ไขแผนที่รวมกำแพงเสมือน และการเชื่อมโหมดหุ่น ส่วน AI วิธีหนึ่งและสองทำแล้วบน PC มีชุด regression 40 กรณี ส่วนวิธีสาม Jetson และเสียงยังค้าง ไม่ใช้คะแนน benchmark เป็นเปอร์เซ็นต์ความสำเร็จของโครงการ','PROGRESS.md; maps.ts; robotIntent.ts')
card(48,153,418,269,'ช่วงที่ 1 · WEBSITE','ระบบเว็บและการควบคุม','Admin + Robot Interface\nBackend / แผนที่สด / POI ทำแล้ว\nยังค้าง: upload / แก้แผนที่ / โหมด')
card(494,153,418,269,'ช่วงที่ 2 · AI','คำสั่งภาษาธรรมชาติ','กฎ + aliases + โมเดลบน PC\nstructured output / benchmark ทำแล้ว\nยังค้าง: บริบท / Jetson / เสียง')
strip('สถานะอ้างอิงโค้ดและผลเดิม · การเคลื่อนที่จริงยังรอตรวจรับ',fill='F9ECE3',ink=ORANGE)

new('ช่วงที่ 1 — ความคืบหน้าฝั่ง Website','PART 01 · WEBSITE',
    'ช่วง Website เริ่มด้วยหน้าที่ของเว็บไซต์ทั้งสองฝั่งและพื้นที่ภาพหน้าจอ ต่อด้วยคำอธิบายเส้นทางคำสั่ง Backend ข้อมูลแผนที่และ POI ก่อนสรุปงานค้างที่ผู้จัดทำระบุคืออัปโหลด แก้ไขแผนที่ กำแพงเสมือนและโหมดของหุ่น การมีปุ่มหรือ API ยังไม่เท่ากับผ่านการตรวจรับอุปกรณ์',dark=True)
tx('Admin Website + Robot Interface',52,171,850,68,43,True,WHITE)
tx('มี Backend และฐานข้อมูลกลาง\nแสดงสถานะ แผนที่ POI และงานนำทาง',52,274,850,99,34,False,'AFC6CD')
tx('รายงาน: หน้าจอ → การไหลของข้อมูล → งานค้าง → ผลตรวจ',52,425,850,40,27,False,'AFC6CD')

new('เว็บไซต์ทั้ง 2 ฝั่ง: หน้าที่และความคืบหน้า','WEBSITE · INTERFACES',
    'Admin Website ใช้โดยเจ้าหน้าที่หรือผู้ดูแลสำหรับดูสถานะ แผนที่ ควบคุมและจัดการจุดหมาย รวมถึงดูงานและบัญชีตามสิทธิ์ Robot Interface ใช้โดยผู้มาเยือนหรือผู้ใช้หุ่น สำหรับเลือกจุดหมาย พิมพ์คำขอ AI ดูงานและยกเลิกงานของตนเอง จุดส่วนตัวถูกกรองจากหน้าใช้งานผู้มาเยือน ช่องสีเทาทั้งสองช่องเป็นรูปทรงแก้ไขได้สำหรับนำภาพหน้าจอมาใส่ ไม่ใช่ภาพหน้าจอจริง','apps/admin; routes/robot.ts; services/chatService.ts')
for x,title,a,b,c,label in [(48,'Admin Website','ผู้ใช้: เจ้าหน้าที่ / ผู้ดูแลระบบ','ดูสถานะ แผนที่ และควบคุมหุ่น','จัดการ POI ผู้ใช้ และประวัติงาน','ใส่รูปหน้า Admin Dashboard'),(494,'Robot Interface','ผู้ใช้: ผู้มาเยือน / ผู้ใช้หุ่น','เลือก POI และพิมพ์คำขอ AI','ติดตามงานและยกเลิกงานของตน','ใส่รูปหน้า Robot Interface')]:
    rect(x,150,418,318,WHITE,LINE);tx(title,x+18,158,382,44,31,True,TEAL);tx(a+'\n'+b+'\n'+c,x+18,210,382,83,23)
    screenshot_slot(x+18,305,382,139,label)

new('เมื่อผู้ใช้กดสั่งงาน ข้อมูลเดินทางอย่างไร','WEBSITE · REQUEST / VALIDATION / ACTION',
    'หนึ่ง ผู้ใช้กดจาก Admin หรือ Robot Interface ส่ง REST request ถึง Backend สอง Backend ตรวจ session หรือ device token บทบาท งาน lock และความพร้อมของแผนที่ สาม บันทึกงานเหตุการณ์ลงฐานข้อมูลเมื่อใช้งานจริง สี่ สั่งหุ่นผ่าน REST adapter ห้า รับข้อมูลหุ่นกลับแล้วส่งสถานะไปเว็บด้วย Socket.IO พร้อม HTTP fallback แหล่งเก็บข้อมูลต่างจากตัวหุ่น เว็บไซต์จึงไม่ยิงคำสั่งฮาร์ดแวร์โดยตรง','app.ts; middleware/auth.ts; jobService.ts; ws/socket.ts; prisma/schema.prisma')
box(48,149,220,116,'ADMIN WEBSITE','1. ส่งคำขอควบคุม\nใช้ session ผู้ใช้')
box(48,313,220,116,'ROBOT INTERFACE','1. ส่งคำขอผู้มาเยือน\nผ่าน server-side proxy')
box(353,198,292,225,'BACKEND','2. ตรวจสิทธิ์และงาน / lock\nตรวจแผนที่และตำแหน่ง\nเลือก adapter ของหุ่น\nประสานฐานข้อมูล',LIGHT,TEAL)
box(719,150,193,112,'DATABASE','3. เก็บงานและเหตุการณ์\nPostgreSQL / Prisma')
box(719,315,193,112,'HERMES','4. รับคำสั่ง REST\nส่ง pose / battery / map')
arrow(268,207,351,250);arrow(268,371,351,349);arrow(645,257,717,206);arrow(645,352,717,371)
strip('5. หุ่น → Backend → เว็บ: อัปเดตสถานะด้วย Socket.IO / HTTP fallback',y=445)

new('แผนที่ POI และการควบคุม: ทำส่วนไหนแล้ว','WEBSITE · IMPLEMENTED FEATURES',
    'แผนที่สดมี grid หุ่น home POI และ LiDAR ซูมและลากได้ จุดหมายเพิ่มแก้ลบและใส่ aliases ได้พร้อมอ่านกลับยืนยัน มี joystick นำทาง กลับแท่นและหยุดที่ผ่านสิทธิ์และ lock การแก้จุด POI ไม่ใช่การแก้ occupancy map หรือกำแพงเสมือนบนหุ่น ผลการอ่านอุปกรณ์เคยตรวจแล้ว แต่การถึงจุดหมายและการหยุดจริงยังรอตรวจรับ','LiveRobotMap.tsx; RobotMapEditor.tsx; jobService.ts; navigationPolicy.ts')
card(48,154,272,267,'MAP','แสดงแผนที่สด','SLAM grid / pose / LiDAR\nหุ่น / home / POI\nซูม ลาก และเวลาอัปเดต')
card(344,154,272,267,'POI','จัดการจุดหมาย','ชื่อ / พิกัด / ทิศ / aliases\nเพิ่ม แก้ ลบทีละจุด\nอ่านกลับก่อนแจ้งสำเร็จ')
card(640,154,272,267,'CONTROL','คำสั่งควบคุม','joystick / นำทาง / กลับแท่น\nmanual lock / halt / E-Stop\nBackend ตรวจสิทธิ์และสถานะ')
strip('การจัดการ POI ทำแล้ว · การแก้แผนที่และกำแพงเสมือนยังเป็นงานค้าง')

new('Website: งานที่ยังค้างอยู่','WEBSITE · REMAINING WORK',
    'งานค้างตามที่ผู้จัดทำระบุมีสามกลุ่ม: อัปโหลดหรือใช้ไฟล์แผนที่ร่วมกับหุ่น แก้ไขแผนที่รวมวาดกำแพงเสมือน และเชื่อมโหมดของหุ่น ในโค้ดเดิมมี import JSON ไป draft และเก็บ keepout polygons แต่ไม่ถือว่าเส้นทางอัปโหลดหรือแก้ SLAM map และกำแพงเสมือนบนหุ่นเสร็จแล้ว ต้องเชื่อม API ใช้กับ navigation และอ่านกลับยืนยันจริง','maps.ts; mapImportSchema; RobotOperatingMode.tsx; SPEC.md')
card(48,154,272,267,'01 · UPLOAD','อัปโหลดแผนที่','รองรับไฟล์และตรวจความถูกต้อง\nเชื่อมการใช้แผนที่กับหุ่น\nอ่านกลับตรวจผลหลังอัปโหลด',accent=ORANGE)
card(344,154,272,267,'02 · MAP EDIT','แก้ไขแผนที่','วาดกำแพงเสมือน\nกำหนดเขตห้ามผ่าน\nใช้ข้อจำกัดกับการนำทางจริง',accent=ORANGE)
card(640,154,272,267,'03 · ROBOT MODE','โหมดของหุ่นยนต์','เชื่อมโหมดปกติ / สำรวจ\nยืนยันสถานะที่หุ่นตอบกลับ\nควบคุมเริ่ม / จบการสร้างแผนที่',accent=ORANGE)
strip('ตัวเลือกโหมดบนเว็บมีแล้ว · การเปลี่ยนโหมดจริงและตรวจรับยังค้าง',fill='F9ECE3',ink=ORANGE)

new('หลักฐานฝั่งระบบเว็บและ Backend','WEBSITE · VERIFICATION',
    'ผล Backend ล่าสุดที่บันทึกไว้ผ่าน 52 tests เป็นจำนวนรวมทั้งระบบ ไม่ใช่ฝั่งเว็บเพียงอย่างเดียว typecheck ผ่าน Admin Robot Interface และ Backend ครอบคลุมสิทธิ์ API เซสชัน งาน แผนที่ POI และการตรวจคำขอ AI ผลอ่านแผนที่ตำแหน่งและ LiDAR จริงเป็นหลักฐานรอบก่อนหน้า ยังไม่อ้างผลเดินจริงหรืออัปโหลดกำแพงเสมือนจริง','PROGRESS.md; apps/backend/test; scripts/check-robot-live.mjs')
card(48,154,272,267,'52 TESTS','Backend ระบบรวม','API / session / สิทธิ์\nงาน / POI / แผนที่ / AI\nผ่านตามผลที่บันทึกไว้')
card(344,154,272,267,'TYPECHECK','ผ่านทุกส่วนหลัก','Admin Website\nRobot Interface\nBackend')
card(640,154,272,267,'HARDWARE READ','เคยตรวจอ่านจริง','pose / battery / map\nLiDAR และ POI จริง\nการเคลื่อนที่ยังรอตรวจรับ')
strip('ใช้หลักฐานเดิม · ไม่ได้รัน tests หรือทดลองอุปกรณ์ใหม่ในการทำสไลด์นี้')

new('ช่วงที่ 2 — ความคืบหน้าฝั่ง AI','PART 02 · AI',
    'AI ปัจจุบันใช้ Qwen3.5-2B Q5_K_M บน PC ผ่าน llama-server ยังไม่ใช่ Jetson เนื้อหาต่อไปอธิบายเทคนิคที่ทำแล้ว ได้แก่กฎและ aliases โมเดลคืน structured JSON และ backend validation พร้อมโค้ดบางส่วนที่จัดบรรทัดเพื่ออ่านง่าย บริบทถามตอบคำสั่งข้ามข้อความและระบบเสียงยังเป็นงานค้าง',dark=True)
tx('AI local เชื่อม Robot Interface แล้ว',52,171,850,69,44,True,WHITE)
tx('Rule-based + POI aliases\nLLM + Structured JSON + Backend validation',52,275,850,99,33,False,'AFC6CD')
tx('Qwen3.5-2B Q5_K_M · llama-server · รันบน PC',52,426,850,40,27,False,'AFC6CD')

new('เทคนิคที่ใช้: Hybrid intent classification','AI · METHODS & CURRENT CAPABILITIES',
    'เป็น hybrid intent classification: ตรวจภาษาและจับชื่อก่อน ถ้าคำขอชัดใช้กฎเพื่อลดการรอ หากรูปประโยคอ้อมให้ LLM ตีความ โดยให้เลือก UUID จากรายการปลายทาง และให้ Backend ตรวจอีกชั้น ไม่ได้ใช้ embeddings vector search หรือ fuzzy matching ในการจับชื่อปัจจุบัน ทั้งสองเทคนิคทำแล้ว ไม่ได้ fine-tune โมเดลใหม่','robotLanguage.ts; robotIntent.ts; robotAiService.ts')
card(48,154,418,267,'METHOD 01 · ทำแล้ว','Rules + Dictionary','Regex แยกเจตนาของประโยค\nชื่อ POI + aliases ที่บันทึกไว้\nคำขอชัดเจน → ไม่รอโมเดล')
card(494,154,418,267,'METHOD 02 · ทำแล้ว','LLM + Structured output','Prompt กำกับเจตนาและรายการจุดหมาย\nJSON Schema จำกัดรูปผลลัพธ์\nZod + Backend ตรวจอีกชั้น')
strip('ไม่ฝึกโมเดลใหม่ · ไม่ให้โมเดลสร้างพิกัดหรือเรียก API หุ่นเอง')

new('ขั้นตอนจริง: ข้อความ → เจตนา → งานนำทาง','AI · IMPLEMENTED PIPELINE',
    'Robot Interface ส่งข้อความ ขั้นแรก normalize และวิเคราะห์ speechAct กับชื่อจุดหมาย คำหยุดที่รองรับเข้าทางลัด ถัดไปกฎหรือโมเดลคืน intent confidence poiCode speechAct needsClarification จากนั้นตรวจ schema รหัสและความกำกวม ก่อนอ่านแผนที่ใหม่และสร้างงาน เฉพาะกรณีผ่านข้อกำหนด หากเป็น dry-run จะคืนผลอย่างเดียว ไม่สร้างงาน','robotIntent.ts; robotAiService.ts')
for x,title,body in [(48,'1. ข้อความ','ไทย / อังกฤษ'),(272,'2. ตีความ','Rules หรือ LLM'),(496,'3. ตรวจผล','Schema / POI / สิทธิ์'),(720,'4. สร้างงาน','ใช้พิกัดจาก Backend')]:box(x,174,192,113,title,body,LIGHT if x==496 else WHITE)
for x in [240,464,688]:arrow(x,229,x+28,229)
rect(48,317,864,109,WHITE,LINE)
tx('ข้อมูลที่โมเดลคืน',64,327,302,36,27,True,TEAL)
tx('intent · confidence · poiCode · speechAct · needsClarification',64,379,830,36,25)
strip('คำปฏิเสธ / สมมติ / ชื่อกำกวม → ปฏิเสธหรือถามใหม่ ไม่สร้างงาน')

new('เทคนิค 1: Normalize + Regex + POI aliases','AI · RULE-BASED CLASSIFICATION',
    'normalize ใช้ NFC เพื่อคงรูปสระภาษาไทย จากนั้นใช้ regular expressions ตรวจคำขอ คำถาม คำปฏิเสธ สมมติและข้อความยกมา matchRobotDestinations เทียบชื่อและ aliases ตรวจขอบเขตชื่ออังกฤษ และเลือกชื่อเฉพาะกว่าที่ทับตำแหน่งเดียวกัน กรณีชื่อซ้ำจะไม่เดา โค้ดที่เห็นเป็นส่วนของ classifyRobotTranscript ที่จัดบรรทัดใหม่ ไม่ใช่ฟังก์ชันที่รันเดี่ยวได้','robotLanguage.ts; robotIntent.ts')
codebox("const language = analyzeRobotLanguage(transcript);\nconst matches = matchRobotDestinations(\n  transcript, catalog\n);\nif (language.stop) return rule('cancel_job');\nif (language.speechAct === 'request') {\n  if (matches.length === 1) {\n    return rule('navigate_to', matches[0].code);\n  }\n}",48,155,565,287,'robotIntent.ts · excerpt',16)
tx('อ่านโค้ดเป็น 3 ขั้น',645,163,267,43,29,True,TEAL)
tx('1. แยกเจตนาของข้อความ\n2. เทียบชื่อกับรายการ POI\n3. ชัดเจนจุดเดียว → คืนรหัส',645,231,267,154,25)
tx('aliases เช่น ทางเข้า → หน้าประตู · ไม่ใช่การเดาจุดที่ไม่มีในรายการ',48,451,864,29,19,False,MUTED)

new('เทคนิค 2: บังคับรูปแบบ JSON และตรวจด้วย Zod','AI · STRUCTURED OUTPUT',
    'LLM มี closed set ของ intent และ poiCode ที่อยู่ใน catalog คำสั่งกำหนด JSON Schema เพื่อให้โมเดลตอบตามรูปแบบ และใช้ Zod ตรวจชนิดและช่วงคะแนนอีกครั้ง โค้ด outputSchema เป็น excerpt ที่จัดบรรทัดจากของจริง strict ไม่ให้เพิ่มฟิลด์อื่น confidence เป็นคะแนนจากโมเดล ไม่ใช่สิทธิ์ให้เดินเอง','robotIntent.ts: outputSchema / schema')
codebox("const outputSchema = z.object({\n  intent: z.enum(intents),\n  confidence: z.number().min(0).max(1),\n  poiCode: z.string().nullable(),\n  speechAct: z.enum(speechActs),\n  needsClarification: z.boolean()\n}).strict();",48,155,565,268,'robotIntent.ts · outputSchema',17)
tx('ผลที่คาดหวัง',645,163,267,43,29,True,TEAL)
tx('intent = navigate_to\npoiCode = UUID ในรายการ\nspeechAct = request\nneedsClarification = false',645,229,267,164,24)
strip('JSON Schema จำกัดรูปแบบ · Zod ตรวจผล · UUID ต้องมีอยู่ใน catalog',y=440)

new('การเรียกโมเดล: Prompt + Schema + ค่าควบคุม','AI · LOCAL LLM REQUEST',
    'Backend เรียก llama-server ผ่าน endpoint chat completions ซึ่งรัน Qwen บน PC prompt อธิบายคำขอสุภาพ คำถาม สมมติ และปฏิเสธ พร้อมรายชื่อ/aliases ของ POI ใช้ temperature 0 seed 42 max tokens 256 และปิด thinking โดยส่ง schema ไปด้วย seed และ temperature ช่วยลดการสุ่มแต่ไม่ได้รับประกันเหมือนกันทุกเครื่องหรืออนุมานว่าคำตอบถูกเสมอ โค้ดนี้ย่อ body จริงเพื่ออ่านบนสไลด์','robotIntent.ts: fetch / system prompt')
codebox("{\n  model: config.ai.model,\n  messages: [systemMessage, userMessage],\n  temperature: 0, seed: 42,\n  max_tokens: 256, stream: false,\n  response_format: {\n    type: 'json_schema', schema\n  },\n  chat_template_kwargs: { enable_thinking: false }\n}",48,155,565,288,'robotIntent.ts · request body (ย่อ)',16)
tx('Prompt กำหนดอะไร',645,162,267,43,29,True,TEAL)
tx('ประโยคสุภาพ = คำขอได้\nแยกคำถาม / ปฏิเสธ / สมมติ\nเลือกรหัสจาก POI ที่ให้เท่านั้น\nชื่อไม่ชัดเจน → ขอข้อมูลเพิ่ม',645,225,267,173,24)
tx('systemMessage / userMessage เป็นชื่อย่อบนสไลด์แทน objects ในโค้ดจริง',48,451,864,29,18,False,MUTED)

new('Backend validation: ไม่เชื่อผลโมเดลอย่างเดียว','AI · VALIDATION BEFORE DISPATCH',
    'หลัง parse JSON มีการตรวจ Zod และตรวจรหัส POI ใน catalog จากนั้น service ตรวจคำปฏิเสธ กำกวม สิทธิ์และชื่อที่ผู้ใช้ระบุ อ่านแผนที่และพิกัดใหม่ก่อน dispatch และตรวจ freshness mapping localization และ lock คำหยุดยังตรวจ command epoch เพื่อกันผล AI ที่มาช้าสั่งเดินภายหลัง โค้ดด้านซ้าย excerpt สองส่วนจากไฟล์จริงจัดบรรทัดและตัดข้อความ error ให้สั้น','robotIntent.ts; robotAiService.ts; navigationPolicy.ts')
codebox("const decision = outputSchema.parse(\n  JSON.parse(content)\n);\nif (decision.poiCode && !catalog.some(\n  p => p.code === decision.poiCode\n)) throw new Error('Unknown POI');\n\nconst dispatchMap = !dryRun &&\n  decision.intent !== 'where_is'\n  ? await dependencies.loadMap() : map;",48,155,565,288,'robotIntent.ts + robotAiService.ts · excerpts',16)
tx('ก่อนส่งงานตรวจเพิ่ม',645,162,267,43,29,True,TEAL)
tx('ชื่อจุดหมายชัดและสิทธิ์ผ่าน\nไม่มีงาน / manual lock ขัดกัน\nแผนที่ใหม่และปิด mapping\nคุณภาพตำแหน่ง ≥ 50',645,225,267,173,24)
tx('confidence ผ่านเกณฑ์อย่างเดียว ยังไม่เพียงพอสำหรับส่งคำสั่งเดิน',48,451,864,29,19,False,ORANGE)

new('ตัวอย่าง: ข้อความต่างสำนวนเลือก POI เดียวกัน','AI · WORKED EXAMPLE',
    'ตัวอย่างนี้อิงชื่อหน้าประตูที่มีหลักฐาน dry-run และชื่อเรียกทางเข้าที่รองรับใน metadata ถ้ามี alias อยู่จริง คำขอสุภาพสองแบบเข้าทางกฎ ส่วนข้อความที่วางจุดหมายก่อนคำขออาจใช้ LLM ผลคือ navigate_to กับรหัสเดียวกัน ข้อมูลด้านขวาเป็นรูปอธิบาย ไม่ใช่ log การทดลองใหม่ คำถามอยู่ไหนต้อง where_is ไม่เดิน และอย่าเพิ่งไปต้องไม่ dispatch','robotIntent.ts; scripts/check-kiosk-ai.mjs; reports/ai-benchmark/hybrid.json')
rect(48,151,520,246,WHITE,LINE);tx('คำขอของผู้ใช้',65,161,486,43,29,True,TEAL)
tx('“ช่วยพาไปที่หน้าประตูหน่อย”\n“ไปส่งที่หน้าประตูได้ไหมครับ”\n“หน้าประตูคือจุดหมายของผม\nคุณช่วยไปส่งผมที่นั่นได้ไหม”',65,230,486,143,27)
box(642,182,270,197,'ผลตีความ','intent: navigate_to\npoiCode: UUID ของหน้าประตู\nspeechAct: request',LIGHT,TEAL)
arrow(568,280,640,280)
strip('“หน้าประตูอยู่ไหน” → ตอบข้อมูล · “อย่าเพิ่งไป” → ไม่ส่งคำสั่งเดิน',y=433)

results={name:json.loads((ROOT/f'reports/ai-benchmark/{name}.json').read_text(encoding='utf-8')) for name in ['baseline','hybrid','model']}
new('ผล benchmark: วัดการตีความและ policy ร่วมกัน','AI · RECORDED BENCHMARK',
    'ชุด regression มี 40 กรณีและ 6 POI fixture ตรวจ outcome และ target ที่คาดหวัง ผลวันที่ 7 ตุลาคม ก่อนปรับผ่าน 21/40 หลัง hybrid และ model เป็นหลักผ่าน 40/40 เสนอเดินผิดเจตนาหรือจุดหมายลด 4 เป็น 0 ในชุดนี้ เป็น dry-run บน PC และชุดที่ใช้พัฒนา ไม่ใช่ผล unseen หรือการเดินจริง hybrid ใช้กฎ 33 กรณี โมเดล 7 กรณี p95 4684 ms','reports/ai-benchmark/{baseline,hybrid,model}.json; docs/benchmark-ai.md')
for i,(name,label) in enumerate([('baseline','ก่อนปรับ'),('hybrid','กฎ + โมเดล'),('model','โมเดล + กฎป้องกัน')]):
    s=results[name]['summary'];y=153+i*77;tx(label,48,y,225,40,27,True);rect(285,y+6,418,27,SOFT,rounded=False);rect(285,y+6,418*s['accuracyPct']/100,27,TEAL if name!='baseline' else '94A6AE',rounded=False);tx(f"{s['passed']}/{s['total']}",726,y-3,179,47,37,True,TEAL if name!='baseline' else MUTED)
tx('Hybrid: Rules 33 / Model 7 · p95 4.684 วินาที · เสนอเดินผิด 4 → 0 กรณี',48,374,864,36,23,True,TEAL)
strip('7 ต.ค. 2569 · PC / dry-run · ชุดพัฒนา ไม่ใช่ unseen test หรือผลเดินจริง',y=433)

new('AI: งานที่ยังค้างอยู่','AI · REMAINING WORK',
    'วิธีสามจะเพิ่ม pending intent และอายุของบริบทสำหรับคำตอบถามกลับหรือคำอ้างที่นั่น ต้องกันงานซ้ำและล้างเมื่อยกเลิก พร้อม benchmark แบบหลายข้อความ Jetson เตรียม source/model แล้วแต่ build พัก ไม่มี server และไม่มีผล benchmark ส่วน STT/TTS ยังไม่เปิดใช้ ทั้งหมดนี้เป็นงานถัดไป ไม่ใช่ความสามารถที่ทำเสร็จแล้ว','PROGRESS.md; SPEC.md; docs/jetson-ai.md')
card(48,154,272,267,'METHOD 03','บริบทถามกลับ','pending intent + timeout\nอ้างจุดหมายข้ามข้อความ\nกันซ้ำ / ยกเลิก / benchmark',accent=ORANGE)
card(344,154,272,267,'JETSON','ย้ายและวัดโมเดล','เริ่ม build ที่พัก\nวัด latency / RAM / เสถียรภาพ\nเลือกโมเดลจากผลบนอุปกรณ์',accent=ORANGE)
card(640,154,272,267,'VOICE','STT / TTS','รับเสียงและอ่านข้อความ\nวัดคุณภาพและความหน่วง\nตรวจร่วมกับอุปกรณ์จริง',accent=ORANGE)
strip('วิธีที่ 1–2 ทำแล้ว · วิธีที่ 3, Jetson และระบบเสียงยังค้าง',fill='F9ECE3',ink=ORANGE)

new('สรุปความคืบหน้า Website และ AI','SUMMARY · Q&A',
    'สรุปฝั่ง Website มี Admin Robot Interface Backend แผนที่สดและ POI แล้ว ส่วน upload แก้แผนที่/กำแพงเสมือนและโหมดหุ่นยังค้าง ฝั่ง AI ทำ hybrid rules + LLM พร้อม JSON schema Zod validation และ backend checks แล้ว ผล regressionผ่าน 40/40 ในชุดพัฒนาบน PC งานต่อคือบริบท Jetson และเสียง เปิดรับคำถามและใช้ speaker notes อ้างตำแหน่งโค้ดได้',dark=True)
tx('WEBSITE',52,171,410,51,38,True,'72D3C5');tx('AI',511,171,400,51,38,True,'72D3C5')
tx('Admin / Robot Interface / POI ทำแล้ว\nUpload / แก้แผนที่ / โหมด ยังค้าง',52,248,410,98,29,False,WHITE)
tx('Rules + LLM + Validation ทำแล้ว\nบริบท / Jetson / เสียง ยังค้าง',511,248,400,98,29,False,WHITE)
tx('52 tests ระบบรวม · AI regression 40/40 · ใช้หลักฐานเดิม',52,389,851,43,27,False,'AFC6CD')
tx('ขอบคุณครับ / ค่ะ',52,443,510,35,29,True,WHITE);tx('Q & A',767,429,137,53,36,True,'72D3C5','right')

assert len(slides)==19
for s in slides:
    visible=' '.join(s['text']).lower()
    assert 'mock' not in visible and 'kiosk' not in visible
deck=OUT/'AI-Robot-Butler-Progress-Website-AI-v2.pptx';pdf_path=OUT/'AI-Robot-Butler-Progress-Website-AI-v2.pdf'
prs.save(deck);pdf.save(pdf_path,garbage=4,deflate=True)
notes=['# ความคืบหน้า Website / AI — ฉบับแก้ไข','19 สไลด์; ภาพรวม 1–2, Website 3–8, AI 9–18, สรุป 19','หน้า 4 มีช่องรูป 2 ช่องสำหรับใส่ภาพเอง; โค้ดบางส่วนย่อและจัดบรรทัดจากโปรเจ็กต์ ไม่ใช่ฟังก์ชันที่รันเดี่ยวได้']
for s in slides:notes.extend([f"## {s['number']}. {s['title']}",s['notes'],'หลักฐาน: '+s['source'] if s['source'] else ''])
(OUT/'speaker-notes.md').write_text('\n\n'.join(notes)+'\n',encoding='utf-8')
(OUT/'slides-content.json').write_text(json.dumps(slides,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'code-excerpts.json').write_text(json.dumps(code_records,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(deck) as z:assert z.testzip() is None
check=Presentation(deck);assert len(check.slides)==19
for s in check.slides:
    assert s.has_notes_slide
    for shape in s.shapes:assert shape.left>=0 and shape.top>=0 and shape.left+shape.width<=prs.slide_width and shape.top+shape.height<=prs.slide_height
with pymupdf.open(pdf_path) as d:
    assert len(d)==19
    canvas=Image.new('RGB',(384*3,246*7),'#dde4e7');draw=ImageDraw.Draw(canvas)
    for i,p in enumerate(d):
        assert len(p.get_text().strip())>80
        pix=p.get_pixmap(matrix=pymupdf.Matrix(.4,.4));im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);x=i%3*384;y=i//3*246;canvas.paste(im,(x,y));draw.text((x+8,y+221),f'{i+1:02d}',fill='#142d3b')
        if i in [3,4,6,11,12,13,14]:p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(OUT/f'preview-{i+1:02d}.png')
    canvas.save(OUT/'contact-sheet.png')
manifest={'date':'2026-10-13','revision':2,'slides':19,'speakerNotes':19,'sections':{'overview':[1,2],'website':[3,8],'ai':[9,18],'summary':[19]},'screenshotSlots':2,'codeSlides':[12,13,14,15],'textOverflow':0,'robotAccess':'none','modelAccess':'none','testsRerun':False,'sources':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'apps/backend/src/services/robotLanguage.ts',ROOT/'apps/backend/src/services/robotIntent.ts',ROOT/'apps/backend/src/services/robotAiService.ts',ROOT/'reports/ai-benchmark/hybrid.json']}}
(OUT/'validation.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'slides':19,'imageSlots':2,'codeSlides':4,'pptxBytes':deck.stat().st_size,'pdfBytes':pdf_path.stat().st_size}))
