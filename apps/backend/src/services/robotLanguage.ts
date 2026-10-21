export interface RobotDestination { code: string; nameTh: string; nameEn: string; aliases?: string[] }
export type SpeechAct = 'request' | 'question' | 'negated' | 'hypothetical' | 'quoted' | 'other';
export interface RobotLanguage { speechAct: SpeechAct; stop: boolean; dock: boolean; location: boolean; status: boolean }

export const normalizeRobotText = (text: string) => text.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const compact = (text: string) => normalizeRobotText(text).replace(/\s+/g, '');
const request = /^(?:(?:ช่วย|กรุณา|โปรด|ขอให้|รบกวน|ได้โปรด)\s*)?(?:(?:ให้)?(?:หุ่น(?:ยนต์)?|คุณ)\s*)?(?:พา(?:ฉัน|ผม|เรา|หนู)?ไป|ไปส่ง(?:ฉัน|ผม|เรา)?(?:ที่)?|นำ(?:ทาง|ฉัน|ผม|เรา)(?:ไป)?|เดินไป|ไป(?:ที่|หา)|กลับ(?:ไป)?|อยากไป|ขอไป|ต้องการไป)|^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:take|bring|guide|escort|lead)\s+(?:me|us)\s+to|^(?:please\s+)?(?:go|navigate|return)\s+to|^(?:i(?:'d| would)?\s+(?:like|want)\s+to\s+go\s+to)|^(?:please\s+)?dock\b/iu;
const stop = /^(?:(?:ช่วย|กรุณา|โปรด|รบกวน)\s*)?(?:หยุด(?:หุ่น(?:ยนต์)?|เดิน|นำทาง)?|ยกเลิก(?:งาน|นำทาง|คำสั่ง)?)(?:\s*(?:เดี๋ยวนี้|ตอนนี้|ก่อน|หน่อย|ที|นะ|ด้วย|ครับ|ค่ะ|คะ))*[.!\s]*$|^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:stop|cancel)(?:\s+(?:the\s+)?(?:robot|navigation|job))?(?:\s+(?:now|please))?[.!?\s]*$/iu;
const negative = /อย่า|ห้าม|ไม่ต้อง|ยังไม่|ไม่เอา|ไม่ไป|do\s+not|don't|not\s+yet|never\s+(?:go|take|move)|without\s+(?:moving|going)/iu;
const hypothetical = /(?:^|\s)if\b|what\s+if|hypothetical|ถ้า|สมมติ/iu;
const metatext = /อ่านคำ|คำว่า|ประโยค|หมายความ|แปลว่า|แปลคำ|ตัวอย่าง|อธิบาย|ignore.*(?:rules|instructions)|system\s+prompt|translate|explain|what\s+does|say\s+the|repeat\s+the/iu;
const abilityQuestion = /^(?:หุ่น|คุณ).*?(?:สามารถ|ทำได้|ได้หรือเปล่า)|^(?:can|could)\s+(?:a|the)\s+robot\b|how\s+(?:do|does|can)\b/iu;

export function analyzeRobotLanguage(text: string): RobotLanguage {
  const value = normalizeRobotText(text);
  const result = { speechAct: 'other' as SpeechAct, stop: false, dock: /จุดชาร์จ|แท่นชาร์จ|ที่ชาร์จ|สถานีชาร์จ|charging\s+(?:station|dock)|charger|\bdock\b/iu.test(value),
    location: /อยู่(?:ที่)?ไหน|อยู่ตรงไหน|(?:บอก|ขอดู|แสดง).*ตำแหน่ง|where\s+is|where\s+can\s+i\s+find|(?:tell|show).*location/iu.test(value),
    status: /แบต|สถานะหุ่น|battery|robot\s+status/iu.test(value) };
  if (negative.test(value)) return { ...result, speechAct: 'negated' };
  if (hypothetical.test(value)) return { ...result, speechAct: 'hypothetical' };
  // Quotes around a POI name are allowed; quoting an instruction as content is not.
  if (metatext.test(value)) return { ...result, speechAct: 'quoted' };
  if (abilityQuestion.test(value)) return { ...result, speechAct: 'question' };
  if (stop.test(value)) return { ...result, speechAct: 'request', stop: true };
  if (request.test(value)) return { ...result, speechAct: 'request' };
  if (result.location || result.status || /ทำไม|อะไร|อย่างไร|what\b|why\b|how\b/iu.test(value)) return { ...result, speechAct: 'question' };
  return result;
}

export function readPoiAliases(metadata?: Record<string, unknown>): string[] {
  return Array.isArray(metadata?.aliases) ? [...new Set(metadata.aliases.filter((name): name is string => typeof name === 'string' && name.trim().length > 0 && name.length <= 80).map(name => name.trim()))].slice(0, 20) : [];
}

/** Prefer specific full names over contained aliases; shared names remain ambiguous. */
export function matchRobotDestinations(text: string, catalog: RobotDestination[]): RobotDestination[] {
  const value = normalizeRobotText(text);
  const hits: { destination: RobotDestination; name: string; start: number; end: number }[] = [];
  for (const destination of catalog) {
    for (const name of new Set([destination.nameTh, destination.nameEn, ...(destination.aliases ?? [])].map(normalizeRobotText).filter(Boolean))) {
      const escaped = name.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      const pattern = `${/^[a-z0-9]/i.test(name) ? '(?<![a-z0-9])' : ''}${escaped}${/[a-z0-9]$/i.test(name) ? '(?![a-z0-9])' : ''}`;
      for (const match of value.matchAll(new RegExp(pattern, 'giu'))) {
        hits.push({ destination, name: compact(name), start: match.index, end: match.index + match[0].length });
      }
    }
  }
  const specific = hits.filter(hit => !hits.some(other => other.name.length > hit.name.length && other.start <= hit.start && other.end >= hit.end));
  return [...new Map(specific.map(hit => [hit.destination.code, hit.destination])).values()];
}
