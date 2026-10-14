// Frozen pre-natural-language dispatcher policy, for reproducible comparisons only.
// Pure interpretation + injected fixture. No hardware functions or job creation.
import { classifyTranscript } from '../src/services/aiService';
import type { LiveRobotMap } from '@hermes/shared';
const stop = /^(?:ช่วย|กรุณา)?\s*(?:หยุด|ยกเลิก|หยุดเดิน|หยุดนำทาง|ยกเลิกงาน|stop|cancel|stop navigation|cancel navigation)[.!\s]*$/iu;
const move = /^(?:(?:ช่วย|กรุณา|โปรด|ขอให้|please)\s*)?(?:พา(?:ฉัน|ผม|เรา)?ไป|นำทาง(?:ไป)?|ไป(?:ที่|หา)?|เดินไป|กลับ(?:ไป)?|go to|take me to|guide me to|navigate to|return to|dock)(?:\s|$|[ก-๙])/iu;
export async function legacyPreview(raw: { transcript: string; lang: 'th' | 'en' }, map: LiveRobotMap) {
  const catalog = (map.pois ?? []).filter(p => p.metadata?.is_public !== false && p.pose && typeof p.metadata?.display_name === 'string');
  const decision = stop.test(raw.transcript) ? { intent: 'cancel_job', confidence: 1, poiCode: null }
    : await classifyTranscript(raw, undefined, catalog.map(p => ({ code: p.id, nameTh: p.metadata!.display_name as string, nameEn: p.metadata!.display_name as string })));
  let rejected = decision.intent === 'unknown' || decision.confidence < 0.8;
  let target: { id: string; name: string; x: number; y: number } | undefined;
  if (['navigate_to', 'return_to_dock', 'where_is'].includes(decision.intent)) {
    if (decision.intent !== 'where_is' && (!move.test(raw.transcript) || /อย่า|ห้าม|ไม่ต้อง|ไม่เอา|ถ้า|สมมติ|don't|do not|if\b|hypothetical|["“”]/iu.test(raw.transcript))) rejected = true;
    const poi = catalog.find(p => p.id === decision.poiCode);
    if (decision.intent === 'return_to_dock' && map.home) target = { id: 'DOCK', name: 'จุดชาร์จ', ...map.home };
    else if (poi?.pose) target = { id: poi.id, name: poi.metadata!.display_name as string, ...poi.pose };
    else rejected = true;
  } else if (!['cancel_job', 'robot_status'].includes(decision.intent)) rejected = true;
  // Previously only the literal stop fast path worked; an inferred stop was unsupported.
  if (decision.intent === 'cancel_job' && !stop.test(raw.transcript)) rejected = true;
  return { replyText: 'Legacy benchmark preview only', ...decision, rejected, dryRun: true,
    needsClarification: false, decisionSource: stop.test(raw.transcript) ? 'rules' as const : 'model' as const, target: rejected ? undefined : target };
}
