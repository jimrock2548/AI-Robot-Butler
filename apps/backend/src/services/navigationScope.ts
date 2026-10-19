import type { Lang } from '@hermes/shared';

/** A bounded navigation service: no implicit follow-up resolution or external transactions. */
export function navigationScopeReply(text: string, lang: Lang): string | null {
  if (/(เรียก|จอง|สั่ง|จ่าย|ซื้อ).*(แท็กซี่|แท๊กซี่|taxi|อาหาร|ตั๋ว|รถ|เงิน)|\b(book|call|order|buy|pay)\b.*\b(taxi|cab|food|ticket|ride)\b/iu.test(text)) {
    return lang === 'th'
      ? 'ตอนนี้ฉันให้บริการนำทางและข้อมูลจุดหมาย ยังเรียกแท็กซี่ จอง ซื้อ หรือชำระเงินไม่ได้ กรุณาติดต่อเจ้าหน้าที่ หรือเลือกจุดหมายที่มีในรายการครับ'
      : 'I provide navigation and destination information. I cannot book taxis, order or pay. Please contact staff or choose a listed destination.';
  }
  if (/(?:ไป|ส่ง|พา|นำทาง).*(?:ที่นั่น|ที่เดิม|ห้องนั้น|ตรงนั้น|ที่ไหนก็ได้)|\b(?:go|take|guide).*\b(?:there|somewhere|same place)\b/iu.test(text)) {
    return lang === 'th' ? 'กรุณาระบุชื่อจุดหมายให้ชัดเจน หรือเลือกจากรายการบนหน้าจอครับ' : 'Please name a destination or choose one from the screen.';
  }
  return null;
}
