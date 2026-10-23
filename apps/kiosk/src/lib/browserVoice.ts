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
  const [notice, setNotice] = useState('');
  const [wakePhrase, setWakePhrase] = useState('สวัสดีเฮอร์มีส');
  const [voices, setVoices] = useState<{ name: string; lang: string; uri: string }[]>([]);
  const [voiceUri, setVoiceUri] = useState('');
  const [rate, setRate] = useState(1);
  const [secure, setSecure] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText); callback.current = onText;
  const speakingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => {
    const w = window as VoiceWindow;
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    setSecure(window.isSecureContext);
    const refresh = () => setVoices((window.speechSynthesis?.getVoices() ?? []).map(v => ({ name: v.name, lang: v.lang, uri: v.voiceURI })));
    refresh(); window.speechSynthesis?.addEventListener?.('voiceschanged', refresh);
    return () => { window.speechSynthesis?.removeEventListener?.('voiceschanged', refresh); if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); } window.speechSynthesis?.cancel(); };
  }, []);
  const stop = () => {
    const current = recognition.current; recognition.current = null;
    if (current) { current.onresult = null; current.onend = null; current.onerror = null; current.abort(); }
    setListening(false);
  };
  const stopSpeaking = () => { utteranceRef.current = null; window.speechSynthesis?.cancel(); speakingRef.current = false; setSpeaking(false); };
  const start = (wakeMode: boolean) => {
    stop(); stopSpeaking();
    if (!window.isSecureContext) { setNotice('เปิดไมค์ผ่าน HTTPS หรือ localhost บนอุปกรณ์นี้ก่อน'); return; }
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
    if (!Constructor) { setNotice('เบราว์เซอร์นี้ไม่รองรับรับเสียง กรุณาพิมพ์ข้อความ'); return; }
    const r = new Constructor(); recognition.current = r;
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
    r.onerror = e => { if (recognition.current !== r) return; setListening(false); if (e.error !== 'aborted') setNotice(`รับเสียงไม่ได้ (${e.error}) ตรวจสิทธิ์ไมค์และอินเทอร์เน็ต หรือใช้การพิมพ์`); };
    r.onend = () => { if (recognition.current === r) setListening(false); };
    try { r.start(); setListening(true); } catch { setListening(false); setNotice('เปิดไมค์ไม่ได้ กรุณาลองใหม่'); }
  };
  const speak = (text: string) => {
    stop(); stopSpeaking();
    if (!window.speechSynthesis) { setNotice('เบราว์เซอร์นี้ไม่รองรับเสียงพูด'); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.lang = lang === 'th' ? 'th-TH' : 'en-US';
    const available = window.speechSynthesis.getVoices();
    const voice = available.find(v => v.voiceURI === voiceUri) ?? available.find(v => v.lang.startsWith(lang));
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; setNotice(''); }
    else setNotice('ยังไม่พบเสียงภาษานี้ในเครื่อง หากไม่มีเสียงให้ติดตั้งชุดเสียงของระบบ');
    utterance.rate = rate;
    speakingRef.current = true; setSpeaking(true);
    utterance.onend = () => { if (utteranceRef.current !== utterance) return; utteranceRef.current = null; speakingRef.current = false; setSpeaking(false); };
    utterance.onerror = event => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null; speakingRef.current = false; setSpeaking(false);
      if (event.error !== 'canceled' && event.error !== 'interrupted') setNotice(`พูดเสียงไม่ได้ (${event.error}) กรุณาตรวจลำโพง เลือกเสียงอื่น หรือเปิดเว็บบนอุปกรณ์ที่ใช้งานจริง`);
    };
    try { window.speechSynthesis.speak(utterance); }
    catch { utteranceRef.current = null; speakingRef.current = false; setSpeaking(false); setNotice('เปิดเสียงพูดไม่ได้ กรุณาตรวจอุปกรณ์เสียงและเลือกเสียงอื่น'); }
  };
  return { supported, listening, speaking, notice, wakePhrase, setWakePhrase, start, stop, speak, stopSpeaking, voices, voiceUri, setVoiceUri, rate, setRate, secure };
}
