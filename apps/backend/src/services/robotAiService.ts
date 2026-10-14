import { z } from 'zod';
import type { LiveRobotMap, Lang, JobSummary } from '@hermes/shared';
import { ApiError } from '../errors';
import { config } from '../config';
import { getWorld } from '../db/memory';
import { hermes, pulseHermesManual, abortHermesJob } from '../hermes/driver';
import { getLiveMap } from './liveMapService';
import { classifyTranscript, recordConversation, type AiDecision } from './aiService';
import { createJob, cancelJob, type JobRequester } from './jobService';
import { buildRobotState } from './robotService';
import { analyzeRobotLanguage, matchRobotDestinations, readPoiAliases } from './robotLanguage';
import { classifyRobotTranscript } from './robotIntent';

const inputSchema = z.object({ transcript: z.string().trim().min(1).max(500), lang: z.enum(['th', 'en']).default('th'), dryRun: z.boolean().default(false) });
export interface RobotAiResult {
  replyText: string;
  intent: string;
  confidence: number;
  rejected: boolean;
  dryRun: boolean;
  needsClarification?: boolean;
  decisionSource?: 'rules' | 'model';
  reason?: string;
  candidates?: { id: string; name: string }[];
  job?: JobSummary;
  target?: { id: string; name: string; x: number; y: number };
}
const commandEpoch = { operator: 0, kiosk: 0 };
let inferenceBusy = false;
let pendingChannel: 'operator' | 'kiosk' | null = null;

interface Dependencies {
  loadMap: () => Promise<LiveRobotMap>;
  classify: typeof classifyTranscript;
}
const defaults: Dependencies = { loadMap: () => getLiveMap(true), classify: classifyRobotTranscript };

/** Operator text only: the model selects known IDs, the backend owns all coordinates and motion rules. */
export async function handleRobotAiCommand(raw: unknown, requester: JobRequester, signal?: AbortSignal, dependencies: Dependencies = defaults): Promise<RobotAiResult> {
  const { transcript, lang, dryRun } = inputSchema.parse(raw);
  const channel = requester.id === null ? 'kiosk' : 'operator';
  const startedAt = Date.now();
  const language = analyzeRobotLanguage(transcript);
  const t = (th: string, en: string) => lang === 'th' ? th : en;
  const finish = (decision: AiDecision, replyText: string, rejected = false, extra: Partial<RobotAiResult> = {}): RobotAiResult => {
    recordConversation(transcript, lang as Lang, decision, extra.job?.id ?? null, startedAt);
    if (rejected) {
      const items = getWorld().aiRejections;
      items.push({ id: items.reduce((max, item) => Math.max(max, item.id), 0) + 1, at: new Date().toISOString(), transcript,
        reason: replyText, detail: { intent: decision.intent, confidence: decision.confidence, poiCode: decision.poiCode ?? null, dryRun } });
    }
    return { replyText, intent: decision.intent, confidence: decision.confidence, rejected, dryRun,
      decisionSource: decision.decisionSource, needsClarification: decision.needsClarification ?? false, ...extra };
  };
  if (signal?.aborted) throw new ApiError(503, 'ai_cancelled', 'ยกเลิกคำขอแล้ว');
  if (language.stop) {
    const decision: AiDecision = { intent: 'cancel_job', confidence: 1, poiCode: null, speechAct: 'request', decisionSource: 'rules' };
    if (dryRun) return finish(decision, t('ทดสอบคำสั่งหยุด — ไม่ส่งคำสั่งให้หุ่น', 'Stop preview only; no command sent.'));
    commandEpoch[channel]++;
    const w = getWorld();
    if (channel === 'kiosk' && w.activeJob() && !['kiosk_touch', 'kiosk_voice'].includes(w.activeJob()!.source)) {
      return finish(decision, 'หุ่นกำลังทำงานของเจ้าหน้าที่ จอผู้ช่วยหยุดงานนี้ไม่ได้', true);
    }
    if (w.activeJob()) await cancelJob(w.activeJob()!.id, { id: requester.id, displayName: requester.name ?? 'ผู้ควบคุม AI' }, 'หยุดจาก AI local', requester.ip);
    else if (w.lock?.mode === 'manual') {
      if (w.lock.heldBy !== requester.id) return finish(decision, 'หุ่นกำลังถูกควบคุมด้วยมือโดยผู้ใช้อื่น กรุณาใช้ปุ่มหยุดฉุกเฉินหากจำเป็น', true);
      if (hermes) await pulseHermesManual(0, 0, requester.id ?? undefined);
      w.sim.halt();
    }
    else if (hermes && inferenceBusy && pendingChannel === channel) await abortHermesJob();
    return finish(decision, t('หยุดงานนำทางและยกเลิกคำสั่ง AI ที่รออยู่แล้ว', 'Navigation and pending AI commands stopped.'));
  }
  if (config.ai.mode !== 'local' && dependencies === defaults) throw new ApiError(503, 'ai_unavailable', 'AI local ยังไม่เปิดใช้งาน');
  if (inferenceBusy) throw new ApiError(409, 'ai_busy', 'กำลังประมวลผลคำสั่งก่อนหน้า สามารถกดหยุดได้ทันที');
  inferenceBusy = true;
  pendingChannel = channel;
  const epoch = commandEpoch[channel];
  try {
    const map = await dependencies.loadMap();
    if (map.pois === null || map.pois === undefined) throw new ApiError(503, 'poi_unavailable', 'อ่านรายการ POI บนหุ่นไม่ได้');
    const destinations = map.pois.filter(p => (channel !== 'kiosk' || p.metadata?.is_public !== false) && p.pose && [p.pose.x, p.pose.y, p.pose.yaw].every(Number.isFinite)
      && typeof p.metadata?.display_name === 'string').map(p => ({ code: p.id, nameTh: p.metadata!.display_name as string, nameEn: p.metadata!.display_name as string, aliases: readPoiAliases(p.metadata) }));
    const decision = await dependencies.classify({ transcript, lang }, signal, destinations);
    if (signal?.aborted || epoch !== commandEpoch[channel]) throw new ApiError(409, 'ai_cancelled', 'คำสั่งนี้ถูกยกเลิกแล้ว');
    if (['negated', 'hypothetical', 'quoted'].includes(language.speechAct)
      || ['negated', 'hypothetical', 'quoted'].includes(decision.speechAct ?? '')) {
      return finish(decision, 'รับทราบครับ ข้อความนี้ไม่ได้ขอให้หุ่นเคลื่อนที่ จึงไม่ส่งคำสั่งเดิน', true, { needsClarification: false, reason: 'not_a_request' });
    }
    const matches = matchRobotDestinations(transcript, destinations);
    if (decision.needsClarification || (matches.length > 1 && ['navigate_to', 'where_is'].includes(decision.intent))) {
      const candidates = matches.map(p => ({ id: p.code, name: p.nameTh }));
      return finish(decision, candidates.length ? `หมายถึงจุดไหนครับ: ${candidates.map(p => p.name).join(' หรือ ')}? กรุณาระบุชื่อจุดเดียว`
        : 'ต้องการไปจุดไหนครับ? กรุณาระบุชื่อ POI ที่มีอยู่บนแผนที่', true,
      { needsClarification: true, candidates, reason: 'destination_unclear' });
    }
    if (decision.confidence < config.ai.minConfidence || decision.intent === 'unknown') return finish(decision, 'ยังไม่แน่ใจคำสั่ง กรุณาระบุชื่อ POI ให้ชัดเจน', true);
    if (decision.intent === 'robot_status') {
      const state = buildRobotState();
      return finish(decision, `หุ่น ${state.mode} · การเชื่อมต่อ ${state.linkStatus} · แบต ${state.telemetry?.batteryPct ?? '—'}% · คุณภาพตำแหน่ง ${map.localizationQuality ?? '—'}/100`);
    }
    if (!['navigate_to', 'return_to_dock', 'where_is'].includes(decision.intent)) return finish(decision, 'หน้านี้รองรับนำทางไป POI กลับจุดชาร์จ ถามตำแหน่ง/สถานะ และหยุดงาน', true);
    if (decision.intent !== 'where_is' && (language.speechAct === 'question'
      || (decision.speechAct ?? language.speechAct) !== 'request')) {
      return finish(decision, 'ข้อความนี้เป็นคำถามหรือไม่ได้ขอให้เคลื่อนที่ จึงไม่ส่งคำสั่งเดิน', true, { reason: 'not_a_request' });
    }
    if (decision.intent === 'navigate_to' && (matches.length !== 1 || matches[0].code !== decision.poiCode)) {
      return finish(decision, 'กรุณาระบุชื่อจุดหมายหรือชื่อเรียกอื่นที่บันทึกไว้ให้ชัดเจน', true, { needsClarification: true, reason: 'destination_unclear' });
    }
    if (decision.intent === 'return_to_dock' && (!language.dock || matches.length > 0)) {
      return finish(decision, 'กรุณาระบุว่าต้องการกลับจุดชาร์จหรือไป POI ใดให้ชัดเจน', true, { needsClarification: true, reason: 'destination_unclear' });
    }
    // A POI can be moved/deleted while inference runs. Never dispatch cached coordinates.
    const dispatchMap = !dryRun && decision.intent !== 'where_is' ? await dependencies.loadMap() : map;
    if (signal?.aborted || epoch !== commandEpoch[channel]) throw new ApiError(409, 'ai_cancelled', 'คำสั่งนี้ถูกยกเลิกแล้ว');
    const poi = dispatchMap.pois?.find(p => p.id === decision.poiCode && destinations.some(item => item.code === p.id)
      && (channel !== 'kiosk' || p.metadata?.is_public !== false));
    const home = dispatchMap.home;
    if (decision.intent === 'return_to_dock' && !home) return finish(decision, 'หุ่นยังไม่มีตำแหน่งจุดชาร์จ', true);
    if (decision.intent !== 'return_to_dock' && (!poi?.pose || ![poi.pose.x, poi.pose.y, poi.pose.yaw].every(Number.isFinite))) return finish(decision, 'ไม่พบ POI นี้บนหุ่น กรุณาเพิ่มจุดในหน้าแผนที่ก่อน', true);
    const target = decision.intent === 'return_to_dock'
      ? { id: 'DOCK', name: 'จุดชาร์จ', x: home!.x, y: home!.y, yaw: home!.yaw }
      : { id: poi!.id, name: poi!.metadata!.display_name as string, ...poi!.pose! };
    if (decision.intent === 'where_is') return finish(decision, `${target.name} อยู่ที่ x=${target.x.toFixed(2)}, y=${target.y.toFixed(2)} m บนแผนที่`, false, { target });
    if (dryRun) return finish(decision, `เข้าใจคำสั่งไป${target.name} — โหมดทดสอบ ไม่ส่งคำสั่งให้หุ่น`, false, { target });
    if (getWorld().lock?.mode === 'manual') return finish(decision, 'กรุณาปล่อยสิทธิ์ควบคุมด้วยมือก่อนสั่ง AI นำทาง', true);
    try {
      const job = await createJob(target.id, channel === 'kiosk' ? 'kiosk_voice' : 'operator', requester, { target: {
        code: target.id, nameTh: target.name, x: target.x, y: target.y, headingDeg: target.yaw * 180 / Math.PI,
        isDock: decision.intent === 'return_to_dock', isPublic: false,
      }, allowDispatch: () => epoch === commandEpoch[channel] && !signal?.aborted && getWorld().lock?.mode !== 'manual' });
      return finish(decision, `หุ่นยืนยันคำสั่งไป${target.name}แล้ว`, false, { job, target });
    } catch (error) {
      if (error instanceof ApiError) return finish(decision, error.message, true, { target });
      throw error;
    }
  } finally { inferenceBusy = false; pendingChannel = null; }
}
