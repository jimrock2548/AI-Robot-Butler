import type { Lang } from '@hermes/shared';
import { hermes } from '../hermes/driver';
import { getWorld } from '../db/memory';
import { buildRobotState } from './robotService';
import { analyzeRobotLanguage, matchRobotDestinations, normalizeRobotText, readPoiAliases } from './robotLanguage';

/** Answers grounded in current robot data, never motion dispatch or LLM-generated facts. */
export async function navigationReply(text: string, lang: Lang): Promise<string | null> {
  const value = normalizeRobotText(text);
  const t = (th: string, en: string) => lang === 'th' ? th : en;
  const language = analyzeRobotLanguage(text);
  if (language.stop) return null;
  if (/อยู่ชั้นไหน|ชั้นอะไร|กี่โมง|เวลา(?:เปิด|ปิด)|(?:which|what)\s+floor|(?:when|what time).*(?:open|close)/iu.test(value)) {
    return t('ยังไม่มีข้อมูลชั้นหรือเวลาเปิดปิดของจุดนี้ครับ กรุณาสอบถามเจ้าหน้าที่ ฉันช่วยบอกจุดหมายที่มีในแผนที่ได้',
      'I do not have verified floor or opening-hour information. Please ask staff. I can help locate destinations on the map.');
  }
  if (language.speechAct === 'request') return null;
  if (/^(?:ขอบคุณ(?:มาก|นะ|ครับ|ค่ะ|คะ|จ้า|ๆ|\s)*|thanks(?: a lot)?|thank you(?: very much)?)[\s.!🙏]*$/iu.test(value)) {
    return t('ยินดีครับ หากต้องการไปจุดอื่น บอกชื่อจุดหมายได้เลย', 'You are welcome. Let me know if you need another destination.');
  }
  if (/^(?:ลาก่อน|บ๊ายบาย|บาย|ไปก่อนนะ|goodbye|bye|see you)(?:ครับ|ค่ะ|คะ|นะ|[\s.!])*$/iu.test(value)) {
    return t('แล้วพบกันใหม่ครับ ขอให้เดินทางโดยสวัสดิภาพ', 'Goodbye. Have a safe journey!');
  }
  if (/^(?:สวัสดี|หวัดดี|hello|hi)(?:ครับ|ค่ะ|คะ|นะ|[\s.!])*$/iu.test(value)) {
    return t('สวัสดีครับ อยากให้พาไปจุดไหน หรืออยากทราบตำแหน่งห้องไหนครับ?', 'Hello! Where would you like to go, or which room would you like to locate?');
  }
  if (/ช่วยอะไร|ทำอะไรได้|ใช้งานอย่างไร|what can you|how.*use/iu.test(value)) {
    return t('ฉันช่วยนำทางไปจุดหมายในแผนที่ บอกตำแหน่ง ดูสถานะหุ่น และหยุดงานนำทางได้ครับ ลองพิมพ์ “มีจุดหมายอะไรบ้าง” หรือเลือกจากรายการบนจอ',
      'I can guide you to mapped destinations, locate rooms, report robot status and stop navigation. Ask for available destinations or select one on screen.');
  }
  if (/(?:ติดต่อ|เรียก|คุยกับ|ขอพบ|แจ้ง).*(?:เจ้าหน้าที่|แอดมิน)|(?:contact|call|speak to|talk to).*(?:staff|operator|receptionist|human)/iu.test(value)) {
    return t('ได้ครับ กรุณาแจ้งรายละเอียดไว้ในแชตนี้ เจ้าหน้าที่สามารถดูข้อความและรับช่วงตอบผ่านหน้าจอนี้ได้ครับ',
      'Please leave the details in this chat. Staff can view the conversation and take over here to assist you.');
  }
  if (language.status) {
    const state = buildRobotState();
    if (state.linkStatus !== 'ok' || !state.telemetry) return t('ขณะนี้ข้อมูลหุ่นไม่สดหรือขาดการเชื่อมต่อ จึงยังยืนยันแบตเตอรี่และสถานะปัจจุบันไม่ได้ครับ',
      'Robot data is stale or disconnected, so I cannot confirm its current battery or status.');
    const modes = { idle: 'รอคำสั่ง', manual: 'ควบคุมด้วยมือ', navigating: 'กำลังนำทาง', docking: 'กำลังกลับแท่น', stopped: 'หยุดฉุกเฉิน' };
    return t(`แบตเตอรี่เหลือ ${state.telemetry.batteryPct}% ครับ หุ่นอยู่ในสถานะ${modes[state.mode]} และเชื่อมต่อปกติ`,
      `Battery: ${state.telemetry.batteryPct}%. Robot state: ${state.mode}; connection is online.`);
  }
  const listing = /(?:มี|ดู|แสดง|ขอ).*(?:จุดหมาย|ห้อง|สถานที่).*(?:บ้าง|ทั้งหมด)|ไปไหนได้บ้าง|(?:list|available).*(?:destinations|rooms)|where can.*go/iu.test(value);
  if (!listing && !language.location) return null;
  try {
    const catalog = hermes ? (await hermes.listPois())
      .filter(poi => poi.metadata?.is_public !== false && poi.metadata?.is_public !== 'false'
        && typeof poi.metadata?.display_name === 'string' && poi.pose && [poi.pose.x, poi.pose.y, poi.pose.yaw].every(Number.isFinite))
      .map(poi => ({ code: poi.id, nameTh: poi.metadata!.display_name as string, nameEn: poi.metadata!.display_name as string,
        aliases: readPoiAliases(poi.metadata), x: poi.pose!.x, y: poi.pose!.y }))
      : getWorld().publishedPois().filter(poi => poi.isPublic);
    if (!catalog.length) return t('ยังไม่มีจุดหมายที่เปิดให้ผู้ใช้เลือกบนแผนที่ครับ กรุณาแจ้งเจ้าหน้าที่เพิ่ม POI ก่อน', 'There are no public destinations on this map yet. Please ask staff to add POIs.');
    if (listing) return t(`จุดหมายที่มีในแผนที่: ${catalog.map(p => p.nameTh).join(', ')} ครับ ต้องการไปจุดไหน?`,
      `Available destinations: ${catalog.map(p => p.nameEn).join(', ')}. Where would you like to go?`);
    const matches = matchRobotDestinations(text, catalog);
    if (matches.length !== 1) return matches.length > 1
      ? t(`หมายถึงจุดไหนครับ: ${matches.map(p => p.nameTh).join(' หรือ ')}?`, `Which destination: ${matches.map(p => p.nameEn).join(' or ')}?`)
      : t('ไม่พบชื่อจุดหมายที่ระบุครับ ลองเลือกจากรายการบนจอหรือถาม “มีจุดหมายอะไรบ้าง”', 'I could not find that destination. Please choose from the list or ask for available destinations.');
    const poi = catalog.find(p => p.code === matches[0].code)!;
    return t(`${poi.nameTh} อยู่ที่ x=${poi.x.toFixed(2)}, y=${poi.y.toFixed(2)} เมตรบนแผนที่ครับ หากต้องการให้พาไป พิมพ์ “พาไป${poi.nameTh}”`,
      `${poi.nameEn} is at x=${poi.x.toFixed(2)}, y=${poi.y.toFixed(2)} metres on the map. To navigate, say “Take me to ${poi.nameEn}”.`);
  } catch {
    return t('ขณะนี้อ่านรายการจุดหมายจากหุ่นไม่ได้ครับ กรุณารอการเชื่อมต่อกลับมาหรือแจ้งเจ้าหน้าที่', 'I cannot read destinations from the robot right now. Please wait for the connection or ask staff.');
  }
}
