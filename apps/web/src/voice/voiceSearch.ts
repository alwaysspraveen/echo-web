// Voice search: records from the microphone until you stop talking, then turns it into text.
// Chrome (web) uses its built-in speech recognition; everywhere else (the desktop app, where
// Chrome's version is unavailable, and other browsers) Whisper runs on this device.
import { create } from 'zustand';

export type VoicePhase = 'idle' | 'listening' | 'loading-model' | 'transcribing' | 'error';

interface VoiceState {
  phase: VoicePhase;
  level: number; // 0..1 mic level while listening
  modelProgress: number; // 0..100 while the model downloads
  interim: string; // live text (Chrome only)
  error: string;
}
export const useVoice = create<VoiceState>(() => ({ phase: 'idle', level: 0, modelProgress: 0, interim: '', error: '' }));
const setV = (p: Partial<VoiceState>) => useVoice.setState(p);

const isDesktop = typeof window !== 'undefined' && 'echoDesktop' in window;
type SR = { new (): SpeechRecognitionLike };
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
const NativeSR: SR | undefined = isDesktop ? undefined : ((window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SR }).webkitSpeechRecognition);

let stopCurrent: (() => void) | null = null;
/** Stops listening early (the result is still used). */
export const stopVoice = () => stopCurrent?.();
/** Cancels listening; nothing is searched. */
let cancelled = false;
export const cancelVoice = () => { cancelled = true; stopCurrent?.(); setV({ phase: 'idle', interim: '', level: 0 }); };

const micError = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  return name === 'NotAllowedError' || name === 'SecurityError'
    ? 'Microphone access is blocked. Allow it for Resona in your system settings, then try again.'
    : name === 'NotFoundError' ? 'No microphone found.' : 'Could not use the microphone.';
};

/** Listens once and resolves with what was said ('' when nothing was heard or it was cancelled). */
export async function listen(): Promise<string> {
  if (useVoice.getState().phase !== 'idle' && useVoice.getState().phase !== 'error') return '';
  cancelled = false;
  setV({ phase: 'listening', level: 0, interim: '', error: '' });
  try {
    const text = NativeSR ? await listenNative(NativeSR) : await transcribe(await record());
    if (cancelled) return '';
    setV({ phase: 'idle', interim: '', level: 0 });
    return text.trim().replace(/^[\s"'.,!?]+|[\s"'.,!?]+$/g, '');
  } catch (e) {
    if (cancelled) return '';
    setV({ phase: 'error', error: e instanceof Error ? e.message : String(e), level: 0 });
    return '';
  } finally {
    stopCurrent = null;
  }
}

// ---------- Chrome's speech recognition ----------
function listenNative(Impl: SR) {
  return new Promise<string>((resolve, reject) => {
    const r = new Impl();
    r.lang = navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = false;
    let final = '';
    r.onresult = (e) => {
      let interim = '';
      final = '';
      for (const res of Array.from(e.results)) (res.isFinal ? (final += res[0].transcript) : (interim += res[0].transcript));
      setV({ interim: final + interim, level: 0.6 });
    };
    r.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve('') : reject(new Error(e.error === 'not-allowed' ? micError({ name: 'NotAllowedError' }) : 'Voice search failed. Check your internet connection.')));
    r.onend = () => resolve(final || useVoice.getState().interim);
    stopCurrent = () => r.stop();
    r.start();
  });
}

// ---------- recording for Whisper ----------
const SAMPLE_RATE = 16000;
async function record(): Promise<Float32Array> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw new Error(micError(e));
  }
  warm(); // start loading the model while the user speaks
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const buf = new Float32Array(analyser.fftSize);

  const spoke = await new Promise<boolean>((resolve) => {
    const started = performance.now();
    let heard = false;
    let quietSince = started;
    let raf = 0;
    const finish = (ok: boolean) => { cancelAnimationFrame(raf); resolve(ok); };
    stopCurrent = () => finish(performance.now() - started > 400);
    // Stop after ~1.4 s of quiet once speech started, or after 10 s.
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      setV({ level: Math.min(1, rms * 12) });
      const t = performance.now();
      if (rms > 0.02) { heard = true; quietSince = t; }
      if (heard && t - quietSince > 1400) return finish(true);
      if (t - started > 10000) return finish(heard);
      if (!heard && t - started > 6000) return finish(false);
      raf = requestAnimationFrame(tick);
    };
    rec.start();
    raf = requestAnimationFrame(tick);
  });

  const stopped = new Promise((r) => (rec.onstop = r));
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  ctx.close().catch(() => {});
  if (!spoke || cancelled) return new Float32Array(0);
  // Decode and resample to 16 kHz mono for Whisper.
  const dec = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const audio = await dec.decodeAudioData(await new Blob(parts, { type: rec.mimeType }).arrayBuffer());
  return audio.getChannelData(0).slice();
}

// ---------- Whisper worker ----------
let worker: Worker | null = null;
let modelReady = false;
let nextId = 1;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { if (!modelReady) setV({ modelProgress: Math.round(m.progress) }); }
    else if (m.type === 'ready') modelReady = true;
    else if (m.type === 'result') { pending.get(m.id)?.resolve(m.text); pending.delete(m.id); }
    else if (m.type === 'error') {
      const err = new Error('Voice search could not start. Check your internet connection (the voice model downloads once).');
      if (m.id === -1) pending.forEach((p) => p.reject(err)), pending.clear();
      else { pending.get(m.id)?.reject(err); pending.delete(m.id); }
    }
  };
  return worker;
}
function warm() { getWorker().postMessage({ type: 'warm' }); }

function transcribe(audio: Float32Array) {
  if (cancelled || audio.length < SAMPLE_RATE * 0.3) return Promise.resolve('');
  setV({ phase: modelReady ? 'transcribing' : 'loading-model', level: 0 });
  const id = nextId++;
  const done = new Promise<string>((resolve, reject) => pending.set(id, { resolve, reject }));
  getWorker().postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
  const check = setInterval(() => { if (modelReady && useVoice.getState().phase === 'loading-model') setV({ phase: 'transcribing' }); }, 200);
  return done.finally(() => clearInterval(check));
}
