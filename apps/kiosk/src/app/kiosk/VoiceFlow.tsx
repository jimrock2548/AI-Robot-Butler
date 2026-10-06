'use client';

import { useEffect, useRef, useState } from 'react';
import type { JobSummary, Lang } from '@hermes/shared';
import { KioskApiError, kioskAiStatus, kioskIntent, kioskVoice, type KioskVoiceResult } from '../../lib/api';

type Stage = 'listen' | 'think' | 'answer';
const u = (n: number) => `calc(${n} * var(--u))`;

export function VoiceFlow({
  lang,
  onClose,
  onJob,
}: {
  lang: Lang;
  onClose: () => void;
  onJob: (job: JobSummary) => void;
}) {
  const [stage, setStage] = useState<Stage>('listen');
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<KioskVoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capability, setCapability] = useState<{ textReady: boolean; voiceReady: boolean; simulated: boolean } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentController = useRef<AbortController | null>(null);
  const cancelled = useRef(false);
  const t = (th: string, en: string) => lang === 'th' ? th : en;

  const releaseMicrophone = () => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    setRecording(false);
  };

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      intentController.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    let live = true;
    kioskAiStatus().then((status) => { if (live) setCapability(status); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const showFailure = (e: unknown) => {
    if (cancelled.current) return;
    setResult(null);
    setError(
      (e instanceof KioskApiError && e.code === 'ai_timeout') || (e instanceof Error && e.name === 'AbortError')
        ? t('รอคำตอบนานเกินไป กรุณาลองใหม่หรือเลือกห้องด้วยการแตะ', 'The request took too long. Try again or choose a room by touch.')
        : e instanceof KioskApiError && e.code === 'ai_unavailable'
        ? t('ระบบ AI ยังไม่พร้อม กรุณาเลือกห้องด้วยการแตะ', 'AI is not ready yet. Please choose a room by touch.')
        : t('ประมวลผลไม่สำเร็จ กรุณาลองอีกครั้งหรือเลือกห้องด้วยการแตะ', 'Could not process your request. Try again or choose a room by touch.'),
    );
    setStage('answer');
  };

  const showResult = (response: KioskVoiceResult) => {
    if (cancelled.current) return;
    if (response.job) {
      onJob(response.job);
      return;
    }
    setResult(response);
    setError(response.rejected ? response.replyText : null);
    setStage('answer');
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(t('เบราว์เซอร์นี้ไม่รองรับไมโครโฟน กรุณาพิมพ์คำถาม', 'Microphone is unavailable. Please type your request.'));
      return;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      const chunks: BlobPart[] = [];
      const media = new MediaRecorder(mic);
      recorder.current = media;
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = () => {
        releaseMicrophone();
        if (cancelled.current) return;
        const audio = new Blob(chunks, { type: media.mimeType || 'audio/webm' });
        if (!audio.size) {
          setError(t('ไม่ได้รับเสียง กรุณาลองใหม่', 'No audio was captured. Please try again.'));
          return;
        }
        setStage('think');
        void kioskVoice(audio, lang).then(showResult).catch(showFailure);
      };
      media.start();
      setRecording(true);
      timeout.current = setTimeout(() => {
        if (media.state === 'recording') media.stop();
      }, 10_000);
    } catch {
      releaseMicrophone();
      setError(t('เปิดไมโครโฟนไม่ได้ กรุณาอนุญาตการใช้งานหรือพิมพ์คำถาม', 'Could not open the microphone. Allow access or type your request.'));
    }
  };

  const submitText = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = transcript.trim();
    if (!text || recording) return;
    setError(null);
    setStage('think');
    const controller = new AbortController();
    intentController.current = controller;
    const deadline = setTimeout(() => controller.abort(), 26_000);
    try {
      showResult(await kioskIntent(text, lang, controller.signal));
    } catch (e) {
      showFailure(e);
    } finally {
      clearTimeout(deadline);
      if (intentController.current === controller) intentController.current = null;
    }
  };

  const close = () => {
    cancelled.current = true;
    intentController.current?.abort();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    releaseMicrophone();
    onClose();
  };

  const steps: Stage[] = ['listen', 'think', 'answer'];
  const stepName: Record<Stage, string> = {
    listen: t('รับคำขอ', 'Listen'),
    think: t('ประมวลผล', 'Process'),
    answer: t('ตอบกลับ', 'Answer'),
  };

  return (
    <div className="voice-flow flex-1 min-h-0 flex flex-col text-center">
      <div className="flex items-center justify-between shrink-0" style={{ gap: u(2) }}>
        <button type="button" onClick={close} className="text-ink-2 bg-surface border border-line rounded active:bg-surface-3"
          style={{ padding: `${u(1.2)} ${u(3)}`, fontSize: u(2.6) }}>
          ← {t('กลับ', 'Back')}
        </button>
        <span className="font-display font-bold text-navy tracking-wide" style={{ fontSize: u(2.2) }}>
          {t('ผู้ช่วยเสียง', 'VOICE ASSISTANT')}
        </span>
      </div>

      <div className="flex shrink-0 border-b border-line" style={{ marginTop: u(3) }} aria-label={t('ขั้นตอนการสนทนา', 'Conversation steps')}>
        {steps.map((step, index) => (
          <div key={step} className={`flex-1 flex items-center justify-center border-b-2 ${step === stage ? 'border-navy text-navy' : 'border-transparent text-ink-3'}`}
            style={{ gap: u(0.8), paddingBottom: u(1.5), fontSize: u(2), fontWeight: step === stage ? 700 : 500 }}
            aria-current={step === stage ? 'step' : undefined}>
            <span className="font-mono" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
            <span>{stepName[step]}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center" style={{ gap: u(2.5), padding: `${u(3)} 0` }}>
        <div className={`voice-emblem shrink-0 border-2 grid place-items-center ${stage === 'answer' && error ? 'border-red bg-red-bg text-red' : 'border-line-2 bg-surface-2 text-navy'}`}
          style={{ width: u(15), height: u(15) }} aria-hidden>
          {stage === 'listen' ? (
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: u(7), height: u(7) }}>
              <rect x="24" y="9" width="16" height="30" rx="8" />
              <path d="M17 30a15 15 0 0 0 30 0M32 45v10m-9 0h18" />
            </svg>
          ) : stage === 'think' ? (
            <span className="voice-wave flex items-center" style={{ gap: u(0.8), height: u(7) }}>
              {[3, 6, 4, 7, 3].map((height, index) => <span key={index} className="bg-navy" style={{ width: u(0.8), height: u(height), animationDelay: `${index * 110}ms` }} />)}
            </span>
          ) : <span className="font-display font-bold" style={{ fontSize: u(7) }}>{error ? '!' : '✓'}</span>}
        </div>

        <div className="w-full">
          <h1 className="font-display font-bold text-ink m-0" style={{ fontSize: u(4.5), lineHeight: 1.2 }}>
            {stage === 'listen'
              ? recording ? t('กำลังฟังอยู่', 'Listening') : t('ต้องการให้ช่วยอะไรครับ?', 'How can I help?')
              : stage === 'think' ? t('กำลังประมวลผล', 'Processing')
                : error ? t('ยังตอบไม่ได้', 'Unable to answer') : t('คำตอบ', 'Answer')}
          </h1>
          <p className="text-ink-2 m-0" style={{ marginTop: u(1), fontSize: u(2.5) }}>
            {stage === 'listen'
              ? recording ? t('พูดได้เลย แล้วกดส่งเสียง', 'Speak now, then send your recording') : t('กดเริ่มพูด หรือพิมพ์คำขอด้านล่าง', 'Start speaking or type your request below')
              : stage === 'think' ? t('รอได้สูงสุดประมาณ 26 วินาที กดกลับเพื่อยกเลิก', 'Please wait up to 26 seconds. Tap Back to cancel.')
                : result?.transcript ?? ''}
          </p>
        </div>

        {stage === 'listen' && <div className="w-full flex flex-col" style={{ gap: u(2) }}>
          <div className="border border-line bg-surface-2 text-ink-2 text-left" style={{ padding: `${u(1.5)} ${u(2)}`, fontSize: u(2.1) }}>
            <span className="font-bold text-amber">{t('โหมดทดลอง', 'DEMO MODE')}</span>
            {' · '}{capability?.textReady
              ? capability.simulated
                ? t('ข้อความสั่งหุ่นจำลองได้ เสียงยังไม่พร้อม', 'Text can control the simulated robot. Voice is not ready yet.')
                : t('ข้อความพร้อมใช้งาน เสียงยังไม่พร้อม', 'Text is available. Voice is not ready yet.')
              : t('ระบบ AI ยังไม่พร้อมใช้งาน', 'AI is not available yet')}
          </div>
          <button type="button" onClick={() => recording ? recorder.current?.stop() : void startRecording()}
            disabled={!capability?.voiceReady}
            className={`font-display font-bold rounded disabled:opacity-50 ${recording ? 'bg-carbon text-white active:bg-carbon-2' : 'bg-navy text-white active:bg-navy-2'}`}
            style={{ width: '100%', height: u(9), fontSize: u(3) }}>
            {recording ? t('ส่งเสียง', 'Send recording') : capability?.voiceReady ? t('เริ่มพูด', 'Start speaking') : t('เสียงยังไม่พร้อม', 'Voice coming soon')}
          </button>
          {recording && <div className="voice-wave flex items-center justify-center" style={{ gap: u(0.7), height: u(3.5) }} aria-hidden>
            {[2, 3.5, 2.7, 3.5, 2].map((height, index) => <span key={index} className="bg-navy" style={{ width: u(0.7), height: u(height), animationDelay: `${index * 110}ms` }} />)}
          </div>}
          <form onSubmit={(event) => void submitText(event)} className="border border-line bg-surface-2 text-left" style={{ padding: u(2) }}>
            <label htmlFor="voice-text" className="font-semibold text-ink-2 block" style={{ marginBottom: u(1.2), fontSize: u(2.2) }}>
              {t('หรือพิมพ์คำขอ', 'Or type your request')}
            </label>
            <div className="flex" style={{ gap: u(1) }}>
              <input id="voice-text" value={transcript} onChange={(event) => setTranscript(event.target.value)}
                disabled={recording} maxLength={500} autoComplete="off"
                className="min-w-0 flex-1 border border-line-2 rounded bg-white text-ink focus:outline-none focus:border-navy"
                style={{ padding: `${u(1.5)} ${u(1.8)}`, fontSize: u(2.4) }}
                placeholder={t('เช่น พาไปห้องประชุม', 'Take me to the meeting room')} />
              <button type="submit" disabled={!transcript.trim() || recording}
                className="shrink-0 bg-navy text-white font-bold rounded disabled:opacity-50 active:bg-navy-2"
                style={{ padding: `0 ${u(2.5)}`, fontSize: u(2.3) }}>
                {t('ส่ง', 'Send')}
              </button>
            </div>
          </form>
          {error && <p role="alert" className="text-red m-0" style={{ fontSize: u(2.3) }}>{error}</p>}
        </div>}

        {stage === 'answer' && <div className="w-full flex flex-col" style={{ gap: u(3) }}>
          <p className={`m-0 border text-left ${error ? 'border-red bg-red-bg text-red' : 'border-line bg-surface-2 text-ink'}`}
            role="status" style={{ padding: u(2.5), fontSize: u(2.7) }}>
            {error ?? result?.replyText}
          </p>
          {error && <button type="button" onClick={() => { setError(null); setStage('listen'); }}
            className="border border-line-2 bg-surface text-navy font-display font-bold rounded active:bg-surface-3"
            style={{ width: '100%', height: u(9), fontSize: u(3) }}>{t('ลองอีกครั้ง', 'Try again')}</button>}
          <button type="button" onClick={close} className="bg-navy text-white font-display font-bold rounded active:bg-navy-2"
            style={{ width: '100%', height: u(9), fontSize: u(3) }}>{t('กลับหน้าแรก', 'Back to home')}</button>
        </div>}
      </div>
    </div>
  );
}
