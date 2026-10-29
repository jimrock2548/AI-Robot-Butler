'use client';
import { useEffect, useRef, useState } from 'react';
import { WakeGate } from '@hermes/shared';

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function useBrowserVoice(lang: 'th' | 'en', onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechStarting, setSpeechStarting] = useState(false);
  const [speechUnlocked, setSpeechUnlocked] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [notice, setNotice] = useState('');
  const [wakePhrase, setWakePhrase] = useState('สวัสดีเฮอร์มีส');
  const [voices, setVoices] = useState<{ name: string; lang: string; uri: string }[]>([]);
  const [voiceUri, setVoiceUri] = useState('');
  const [rate, setRate] = useState(1);
  const [secure, setSecure] = useState(false);
  const [checked, setChecked] = useState(false);
  const [httpsUrl, setHttpsUrl] = useState('');
  const [checkingMic, setCheckingMic] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText); callback.current = onText;
  const speakingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSpeech = useRef<string | null>(null);
  useEffect(() => {
    const w = window as VoiceWindow;
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    setSecure(window.isSecureContext);
    setChecked(true);
    setHttpsUrl(`https://${window.location.hostname}:3443/ai`);
    if (!window.isSecureContext) setNotice('หน้านี้เปิดผ่าน HTTP จึงใช้ไมค์ไม่ได้ กรุณาเปิดทางเข้า HTTPS และติดตั้งใบรับรองของห้องแลปก่อน');
    else if (!(w.SpeechRecognition ?? w.webkitSpeechRecognition)) setNotice('เบราว์เซอร์นี้ไม่มีระบบถอดเสียง ลองเปิดด้วย Safari บน iPad และเปิด Siri หรือใช้ไมค์บนแป้นพิมพ์เพื่อพิมพ์ข้อความ');
    const refresh = () => setVoices((window.speechSynthesis?.getVoices() ?? []).map(v => ({ name: v.name, lang: v.lang, uri: v.voiceURI })));
    refresh(); window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => { window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh); if (speechTimer.current) clearTimeout(speechTimer.current); utteranceRef.current = null; if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); } window.speechSynthesis?.cancel(); };
  }, []);
  const stop = () => {
    const current = recognition.current; recognition.current = null;
    if (current) { current.onresult = null; current.onend = null; current.onerror = null; current.abort(); }
    setListening(false);
  };
  const stopSpeaking = () => {
    if (speechTimer.current) { clearTimeout(speechTimer.current); speechTimer.current = null; }
    utteranceRef.current = null; pendingSpeech.current = null; window.speechSynthesis?.cancel();
    speakingRef.current = false; setSpeaking(false); setSpeechStarting(false);
  };
  const microphoneError = (code: string) => {
    if (['not-allowed', 'NotAllowedError', 'SecurityError'].includes(code)) return 'ยังไม่ได้รับสิทธิ์ไมค์ เปิดการตั้งค่าเว็บไซต์ใน Safari → ไมโครโฟน → อนุญาต แล้วลองใหม่ ตรวจสิทธิ์ไมค์ของเบราว์เซอร์ใน Settings ด้วย';
    if (code === 'service-not-allowed') return 'บริการถอดเสียงไม่อนุญาต บน iPad ให้เปิด Siri ใน Settings และลองผ่าน Safari อีกครั้ง';
    if (['audio-capture', 'NotFoundError', 'NotReadableError'].includes(code)) return 'เข้าถึงไมค์ไม่ได้ ตรวจว่าอุปกรณ์มีไมค์และไม่มีแอปอื่นใช้งานอยู่ แล้วลองใหม่';
    if (code === 'network') return 'บริการถอดเสียงเชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตและการเปิด Siri บน iPad หรือใช้การพิมพ์';
    if (code === 'no-speech') return 'ยังไม่ได้ยินเสียง กดพูดแล้วลองพูดอีกครั้ง';
    return `เปิดรับเสียงไม่ได้ (${code}) กรุณาลองผ่าน Safari หรือตรวจสิทธิ์ไมค์และใช้การพิมพ์แทน`;
  };
  const checkMicrophone = async () => {
    if (checkingMic) return;
    if (!window.isSecureContext) { setNotice('ต้องเปิดทางเข้า HTTPS ที่เชื่อถือได้ก่อนขอสิทธิ์ไมค์บน iPad'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setNotice('เบราว์เซอร์นี้ไม่เปิดให้เข้าถึงไมค์ ลองเปิด URL เดียวกันใน Safari'); return; }
    stop(); stopSpeaking(); setCheckingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach(track => track.stop());
      setNotice('เข้าถึงไมค์ได้แล้ว กดพูดเพื่อเริ่มถอดเสียง หาก Safari ยังถอดเสียงไม่ได้ให้ตรวจว่าเปิด Siri ไว้');
    } catch (e) { setNotice(microphoneError(e instanceof Error ? e.name : 'unknown')); }
    finally { setCheckingMic(false); }
  };
  const start = (wakeMode: boolean) => {
    stop(); stopSpeaking();
    if (!window.isSecureContext) { setNotice('หน้านี้เป็น HTTP กรุณาเปิดทางเข้า HTTPS ที่เชื่อถือได้ก่อนใช้ไมค์บน iPad'); return; }
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
    if (!Constructor) { setNotice('เบราว์เซอร์นี้ไม่มีระบบถอดเสียง ลอง Safari บน iPad และเปิด Siri หรือใช้ไมค์บนแป้นพิมพ์เพื่อพิมพ์ข้อความ'); return; }
    let r: Recognition;
    try { r = new Constructor(); } catch (e) { setNotice(microphoneError(e instanceof Error ? e.name : 'unknown')); return; }
    recognition.current = r;
    r.lang = lang === 'th' ? 'th-TH' : 'en-US'; r.continuous = wakeMode; r.interimResults = false;
    const gate = new WakeGate(wakePhrase);
    setNotice(wakeMode ? `เรียก “${wakePhrase}” ก่อนพูดคำสั่ง` : 'พูดคำสั่ง ระบบจะส่งเมื่อพูดจบ');
    r.onresult = event => {
      if (recognition.current !== r || speakingRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        let text = event.results[i][0].transcript.trim();
        if (wakeMode) {
          const result = gate.accept(text);
          if (result.armed) { setNotice('ได้ยินชื่อแล้ว พูดคำสั่งภายใน 8 วินาที'); continue; }
          if (result.command === null) { setNotice(`ยังไม่รับคำสั่ง กรุณาเรียก “${wakePhrase}” ก่อน`); continue; }
          text = result.command;
        }
        if (text) { stop(); setNotice('รับเสียงแล้ว กำลังส่งข้อความ'); callback.current(text.slice(0, 500)); break; }
      }
    };
    r.onerror = e => { if (recognition.current !== r) return; stop(); if (e.error !== 'aborted') setNotice(microphoneError(e.error)); };
    r.onend = () => { if (recognition.current === r) setListening(false); };
    try { r.start(); if (recognition.current === r) setListening(true); } catch (e) { stop(); setNotice(microphoneError(e instanceof Error ? e.name : 'unknown')); }
  };
  const speak = (text: string) => {
    stop(); stopSpeaking();
    if (!text.trim()) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { setSpeechError('เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน กรุณาลอง Safari หรืออ่านคำตอบบนหน้าจอ'); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.lang = lang === 'th' ? 'th-TH' : 'en-US';
    const available = window.speechSynthesis.getVoices();
    const voice = available.find(v => v.voiceURI === voiceUri) ?? available.find(v => v.lang.startsWith(lang));
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; setNotice(''); }
    else setNotice('ยังไม่พบเสียงภาษานี้ในเครื่อง หากไม่มีเสียงให้ติดตั้งชุดเสียงของระบบ');
    utterance.rate = rate;
    utterance.volume = 1;
    pendingSpeech.current = text; setSpeechError(''); setSpeechStarting(true);
    const clearTimer = () => { if (speechTimer.current) { clearTimeout(speechTimer.current); speechTimer.current = null; } };
    utterance.onstart = () => {
      if (utteranceRef.current !== utterance) return;
      clearTimer(); pendingSpeech.current = null; setSpeechUnlocked(true); setSpeechStarting(false);
      speakingRef.current = true; setSpeaking(true); setSpeechError('');
    };
    utterance.onend = () => { if (utteranceRef.current !== utterance) return; clearTimer(); pendingSpeech.current = null; utteranceRef.current = null; speakingRef.current = false; setSpeaking(false); setSpeechStarting(false); };
    utterance.onerror = event => {
      if (utteranceRef.current !== utterance) return;
      clearTimer(); utteranceRef.current = null; speakingRef.current = false; setSpeaking(false); setSpeechStarting(false);
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      pendingSpeech.current = text; setSpeechUnlocked(false);
      const message = event.error === 'not-allowed' ? 'Safari ยังไม่อนุญาตเสียงอัตโนมัติ แตะ “เปิดเสียงตอบกลับ” เพื่อเริ่มอ่านคำตอบ'
        : ['language-unavailable', 'voice-unavailable'].includes(event.error) ? 'ไม่มีเสียงอ่านภาษาที่เลือก กรุณาเลือกเสียงอื่นหรือติดตั้งเสียงภาษาไทยใน Settings ของ iPad'
        : `พูดเสียงไม่ได้ (${event.error}) กรุณาทดสอบลำโพง เลือกเสียงอื่น และตรวจระดับเสียงของ iPad`;
      setSpeechError(message); setNotice(message);
    };
    // WebKit may silently ignore speech started after an asynchronous AI response, without firing error.
    speechTimer.current = setTimeout(() => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null; speechTimer.current = null; window.speechSynthesis.cancel();
      speakingRef.current = false; setSpeaking(false); setSpeechStarting(false); setSpeechUnlocked(false);
      const message = 'ยังไม่ได้รับสัญญาณเริ่มเสียง แตะ “เปิดเสียงตอบกลับ” เพื่ออ่านคำตอบอีกครั้ง หากยังเงียบให้เลือกเสียงและตรวจระดับเสียง iPad';
      setSpeechError(message); setNotice(message);
    }, 5000);
    try { window.speechSynthesis.resume?.(); window.speechSynthesis.speak(utterance); }
    catch { clearTimer(); utteranceRef.current = null; speakingRef.current = false; setSpeaking(false); setSpeechStarting(false); setSpeechUnlocked(false); setSpeechError('เปิดเสียงพูดไม่ได้ แตะเปิดเสียงอีกครั้งหรือตรวจอุปกรณ์เสียงและเลือกเสียงอื่น'); }
  };
  // Must run synchronously from a real button click; do not await AI or microphone permission first.
  const enableSpeech = () => speak(pendingSpeech.current ?? (lang === 'th' ? 'พร้อมตอบกลับด้วยเสียงแล้วครับ' : 'Voice replies are ready.'));
  return { supported, listening, speaking, speechStarting, speechUnlocked, speechError, enableSpeech, notice, wakePhrase, setWakePhrase, start, stop, speak, stopSpeaking, voices, voiceUri, setVoiceUri, rate, setRate, secure, checked, httpsUrl, checkingMic, checkMicrophone };
}
