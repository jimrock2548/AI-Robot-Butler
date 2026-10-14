import { z } from 'zod';
import type { AiConversation, AiRejection, JobSummary, Lang } from '@hermes/shared';
import { config } from '../config';
import { ApiError } from '../errors';
import { getWorld } from '../db/memory';
import { cancelJob, createJob } from './jobService';

const intentSchema = z.enum([
  'navigate_to', 'where_is', 'answer_question', 'check_in_visitor',
  'call_reception', 'cancel_job', 'return_to_dock', 'robot_status', 'unknown',
]);
const decisionSchema = z.object({
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
  poiCode: z.string().nullable().optional(),
  speechAct: z.enum(['request', 'question', 'negated', 'hypothetical', 'quoted', 'other']).optional(),
  needsClarification: z.boolean().optional(),
  decisionSource: z.enum(['rules', 'model']).optional(),
});
export type AiDecision = z.infer<typeof decisionSchema>;

const transcriptSchema = z.object({
  transcript: z.string().trim().min(1).max(500),
  lang: z.enum(['th', 'en']),
});

export interface AiResult {
  transcript: string;
  replyText: string;
  intent: string | null;
  rejected: boolean;
  job?: JobSummary | null;
}

function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

export function recordConversation(transcript: string, lang: Lang, decision: AiDecision, jobId: number | null, startedAt: number): void {
  const w = getWorld();
  const row: AiConversation = {
    id: nextId(w.aiConversations), at: new Date().toISOString(), lang, transcript,
    intent: decision.intent === 'unknown' ? null : decision.intent,
    confidence: decision.confidence, jobId, latencyMs: Date.now() - startedAt,
  };
  w.aiConversations.push(row);
}

function reject(transcript: string, lang: Lang, decision: AiDecision, reason: string, startedAt: number, replyText: string): AiResult {
  const w = getWorld();
  const row: AiRejection = {
    id: nextId(w.aiRejections), at: new Date().toISOString(), transcript, reason,
    detail: { intent: decision.intent, confidence: decision.confidence, poiCode: decision.poiCode ?? null },
  };
  w.aiRejections.push(row);
  recordConversation(transcript, lang, decision, null, startedAt);
  return { transcript, replyText, intent: decision.intent, rejected: true };
}

function parseModelContent(content: string): AiDecision {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return decisionSchema.parse(JSON.parse(trimmed));
  } catch {
    throw new ApiError(502, 'ai_invalid_output', 'โมเดลส่งผลลัพธ์ที่ตรวจสอบไม่ได้');
  }
}

/** Model proposes one item from a closed vocabulary. It never receives a robot URL or tool credentials. */
export async function classifyTranscript(raw: unknown, requestSignal?: AbortSignal,
  destinations?: { code: string; nameTh: string; nameEn: string }[]): Promise<AiDecision> {
  if (config.ai.mode !== 'local') throw new ApiError(501, 'ai_unavailable', 'ระบบ AI ยังไม่พร้อมใช้งาน');
  const { transcript, lang } = transcriptSchema.parse(raw);
  const pois = destinations ?? getWorld().publishedPois().filter((poi) => poi.isPublic)
    .map((poi) => ({ code: poi.code, nameTh: poi.nameTh, nameEn: poi.nameEn }));
  const active = getWorld().activeJob();
  const system = [
    'You classify a visitor request for a reception robot. Return one JSON object only.',
    'Keys: intent, confidence, poiCode. No markdown and no extra fields.',
    `intent is exactly one of navigate_to, where_is, answer_question, check_in_visitor, call_reception, cancel_job, unknown${destinations ? ', return_to_dock, robot_status' : ''}.`,
    ...(destinations ? ['An explicit request to return to the charging station is return_to_dock with poiCode null. A battery or robot-status question is robot_status with poiCode null.',
      'If a request contains negation, hypothetical movement, multiple movement destinations, or quoted instructions, return unknown.'] : []),
    'If a destination is requested, poiCode must be a code from the public destinations list. Never invent a code.',
    'If the request is ambiguous, out of scope, or names no matching public destination, use unknown with poiCode null.',
    'A question asking where a listed room is (อยู่ไหน, อยู่ที่ไหน, where is) is where_is, not answer_question.',
    'confidence is your estimate between 0 and 1. Do not execute any action.',
    `Public destinations: ${JSON.stringify(pois)}`,
    `Active kiosk navigation: ${active && ['kiosk_touch', 'kiosk_voice'].includes(active.source) ? 'yes' : 'no'}`,
    'A request to stop or cancel current navigation is cancel_job, including short commands such as หยุด or stop.',
    `Visitor language: ${lang}`,
  ].join('\n');

  let response: Response;
  try {
    response = await fetch(new URL('/v1/chat/completions', config.ai.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: transcript }],
        temperature: 0,
        max_tokens: 112,
        stream: false,
        response_format: { type: 'json_object' },
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: requestSignal
        ? AbortSignal.any([requestSignal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (requestSignal?.aborted) throw new ApiError(503, 'ai_cancelled', 'ยกเลิกคำขอแล้ว');
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new ApiError(504, 'ai_timeout', 'โมเดล AI ตอบช้าเกินไป กรุณาลองใหม่');
    }
    throw new ApiError(503, 'ai_unavailable', 'เชื่อมต่อโมเดล AI ไม่ได้');
  }
  if (!response.ok) throw new ApiError(503, 'ai_unavailable', 'โมเดล AI ในเครื่องไม่พร้อมใช้งาน');
  let data: { choices?: { message?: { content?: unknown } }[] };
  try {
    data = await response.json() as typeof data;
  } catch {
    throw new ApiError(502, 'ai_invalid_output', 'โมเดลส่งผลลัพธ์ที่ตรวจสอบไม่ได้');
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new ApiError(502, 'ai_invalid_output', 'โมเดลส่งผลลัพธ์ที่ตรวจสอบไม่ได้');
  return parseModelContent(content);
}

/** Closed tool dispatcher. The same backend services enforce link, lock and job rules again. */
export async function handleKioskIntent(raw: unknown, classify = classifyTranscript, requestSignal?: AbortSignal): Promise<AiResult> {
  const { transcript, lang } = transcriptSchema.parse(raw);
  const startedAt = Date.now();
  // An explicit stop command must not wait for LLM inference.
  const immediateStop = /^(?:หยุด|ยกเลิก|หยุดเดิน|หยุดนำทาง|stop|cancel|stop navigation|cancel navigation)[.!\s]*$/iu.test(transcript);
  const asksLocation = /อยู่(?:ที่)?ไหน|where is|where can i find/iu.test(transcript)
    && !/พาไป|นำทาง|take me|go to/iu.test(transcript);
  const publicMatches = asksLocation ? getWorld().publishedPois().filter((poi) => poi.isPublic
    && [poi.nameTh, poi.nameEn].some((name) => transcript.toLocaleLowerCase().includes(name.toLocaleLowerCase()))) : [];
  const decision = immediateStop
    ? { intent: 'cancel_job' as const, confidence: 1, poiCode: null }
    : publicMatches.length === 1
      ? { intent: 'where_is' as const, confidence: 1, poiCode: publicMatches[0].code }
      : await classify({ transcript, lang }, requestSignal);
  if (requestSignal?.aborted) throw new ApiError(503, 'ai_cancelled', 'ยกเลิกคำขอแล้ว');
  const t = (th: string, en: string) => lang === 'th' ? th : en;
  const deny = (reason: string, th: string, en: string) => reject(transcript, lang, decision, reason, startedAt, t(th, en));

  if (decision.intent === 'unknown' || decision.confidence < config.ai.minConfidence) {
    return deny('low_confidence', 'ยังไม่เข้าใจคำขอ กรุณาพูดให้ชัดขึ้นหรือเลือกห้องบนจอ', 'I did not understand. Please try again or choose a room on screen.');
  }
  const w = getWorld();
  if (w.activeJob() && decision.intent !== 'cancel_job') {
    return deny('job_in_progress', 'หุ่นกำลังทำงานอยู่ กรุณารอหรือกดหยุดบนจอ', 'The robot is busy. Please wait or use the stop button.');
  }

  if (decision.intent === 'navigate_to' || decision.intent === 'where_is') {
    const map = w.findPublishedMap();
    const poi = map && w.mapPois(map.id).find((item) => item.code === decision.poiCode);
    if (!map || !poi) return deny('unknown_poi', 'ไม่พบจุดหมายในแผนที่ที่เผยแพร่', 'That destination is not on the published map.');
    if (!poi.isPublic) return deny('restricted_poi', 'จุดหมายนี้ไม่เปิดให้ผู้มาเยือน', 'That destination is not open to visitors.');
    if (decision.intent === 'where_is') {
      recordConversation(transcript, lang, decision, null, startedAt);
      return {
        transcript, intent: decision.intent, rejected: false,
        replyText: lang === 'th' && poi.zone
          ? `${poi.nameTh} อยู่บริเวณ${poi.zone}`
          : t(`${poi.nameTh} อยู่ในแผนที่อาคาร`, `${poi.nameEn} is on the building map.`),
      };
    }
    try {
      if (requestSignal?.aborted) throw new ApiError(503, 'ai_cancelled', 'ยกเลิกคำขอแล้ว');
      const job = await createJob(poi.code, 'kiosk_voice', { id: null, name: 'จอหุ่น (AI)' }, { requirePublic: true });
      recordConversation(transcript, lang, decision, job.id, startedAt);
      return { transcript, intent: decision.intent, rejected: false, job,
        replyText: t(`กำลังพาไป${poi.nameTh}`, `Taking you to ${poi.nameEn}`) };
    } catch (error) {
      if (error instanceof ApiError) {
        return deny(error.code, 'ยังเริ่มนำทางไม่ได้ กรุณาลองใหม่หรือแจ้งเจ้าหน้าที่', 'I cannot start navigation. Please try again or ask staff.');
      }
      throw error;
    }
  }

  if (decision.intent === 'cancel_job') {
    const active = w.activeJob();
    if (!active || !['kiosk_touch', 'kiosk_voice'].includes(active.source)) {
      return deny('no_kiosk_job', 'ไม่มีงานของจอหุ่นที่หยุดได้', 'There is no kiosk job to stop.');
    }
    try {
      await cancelJob(active.id, { id: null, displayName: 'จอหุ่น (AI)' }, 'ยกเลิกด้วยคำสั่งเสียง');
      recordConversation(transcript, lang, decision, active.id, startedAt);
      return { transcript, intent: decision.intent, rejected: false,
        replyText: t('หยุดการนำทางแล้ว', 'Navigation stopped.') };
    } catch (error) {
      if (error instanceof ApiError) return deny(error.code, 'ยังหยุดงานไม่ได้ กรุณากดปุ่มหยุดบนจอ', 'I could not stop the job. Please use the stop button.');
      throw error;
    }
  }

  return deny('tool_unavailable', 'คำขอนี้ยังไม่พร้อมใช้งาน กรุณาติดต่อเจ้าหน้าที่', 'This request is not available yet. Please ask staff.');
}
