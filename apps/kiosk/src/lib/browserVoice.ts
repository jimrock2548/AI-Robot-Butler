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
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText); callback.current = onText;
  const speakingRef = useRef(false);
  useEffect(() => {
    const w = window as VoiceWindow;
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => { if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); } window.speechSynthesis?.cancel(); };
  }, []);
  const stop = () => {
    const current = recognition.current; recognition.current = null;
    if (current) { current.onresult = null; current.onend = null; current.onerror = null; current.abort(); }
    setListening(false);
  };
  const stopSpeaking = () => { window.speechSynthesis?.cancel(); speakingRef.current = false; setSpeaking(false); };
  const start = (wakeMode: boolean) => {
    stop(); stopSpeaking();
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
    if (!Constructor) { setNotice('เบราว์เซอร์นี้ไม่รองรับรับเสียง กรุณาพิมพ์ข้อความ'); return; }
    const r = new Constructor(); recognition.current = r;
    r.lang = lang === 'th' ? 'th-TH' : 'en-US'; r.continuous = wakeMode; r.interimResults = false;
    const gate = new WakeGate(wakePhrase);
    setNotice(wakeMode ? `เรียก “${wakePhrase}” ก่อนพูดคำสั่ง` : 'พูดคำสั่ง แล้วตรวจข้อความก่อนกดส่ง');
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
        if (text) { callback.current(text.slice(0, 500)); setNotice('รับเสียงแล้ว ตรวจข้อความและกดส่ง'); r.abort(); break; }
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
    utterance.lang = lang === 'th' ? 'th-TH' : 'en-US';
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith(lang));
    if (voice) utterance.voice = voice;
    else setNotice('ยังไม่พบเสียงภาษานี้ในเครื่อง หากไม่มีเสียงให้ติดตั้งชุดเสียงของระบบ');
    speakingRef.current = true; setSpeaking(true);
    utterance.onend = utterance.onerror = () => { speakingRef.current = false; setSpeaking(false); };
    window.speechSynthesis.speak(utterance);
  };
  return { supported, listening, speaking, notice, wakePhrase, setWakePhrase, start, stop, speak, stopSpeaking };
}
