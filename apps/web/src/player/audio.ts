import { useEffect, useState, useSyncExternalStore } from 'react';

/** The one audio element for the whole app. */
export const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
if (audio) audio.preload = 'auto';

// ---------- volume with fades (for crossfade) ----------
let baseVolume = 0.64;
let gain = 1;
const applyVolume = () => { if (audio) audio.volume = Math.max(0, Math.min(1, baseVolume * gain)); };
export function setBaseVolume(v: number) { baseVolume = v; applyVolume(); }

/** Ramps a value from `from` to `to` over `ms`, calling `set` each frame. Returns a cancel function. */
function ramp(from: number, to: number, ms: number, set: (v: number) => void, done?: () => void) {
  const start = performance.now();
  let raf = 0;
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / ms);
    set(from + (to - from) * t);
    if (t < 1) raf = requestAnimationFrame(tick); else done?.();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

let cancelFadeIn: (() => void) | null = null;
/** Fade the main player in from silence (the incoming song of a crossfade). */
export function fadeIn(ms: number) {
  cancelFadeIn?.();
  gain = 0; applyVolume();
  cancelFadeIn = ramp(0, 1, ms, (g) => { gain = g; applyVolume(); }, () => { cancelFadeIn = null; });
}
export function resetFade() { cancelFadeIn?.(); cancelFadeIn = null; gain = 1; applyVolume(); }

/** Second player that keeps the outgoing song's tail playing while it fades out. */
export const fader = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
let cancelFadeOut: (() => void) | null = null;
export function fadeOutCurrent(ms: number) {
  if (!fader || !audio.currentSrc) return;
  cancelFadeOut?.();
  fader.src = audio.currentSrc;
  fader.currentTime = audio.currentTime;
  fader.volume = audio.volume;
  fader.play().catch(() => {});
  const startVol = audio.volume;
  cancelFadeOut = ramp(1, 0, ms, (g) => { fader.volume = startVol * g; }, () => { fader.pause(); fader.removeAttribute('src'); fader.load(); cancelFadeOut = null; });
}

// Seeks the app makes itself (e.g. resuming at the same spot after switching source) are not user
// seeks; Listen Together checks this so it doesn't broadcast them to the room.
let internalSeekAt = 0;
export function markInternalSeek() { internalSeekAt = performance.now(); }
export const isInternalSeek = () => performance.now() - internalSeekAt < 1500;

export function seek(seconds: number) {
  if (!audio || !Number.isFinite(seconds)) return;
  const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
  audio.currentTime = Math.max(0, Math.min(seconds, max));
}

const subscribe = (events: string[]) => (cb: () => void) => {
  events.forEach((e) => audio.addEventListener(e, cb));
  return () => events.forEach((e) => audio.removeEventListener(e, cb));
};
const subTime = subscribe(['timeupdate', 'seeked', 'emptied', 'loadedmetadata']);
const subDuration = subscribe(['durationchange', 'loadedmetadata', 'emptied']);
const subWaiting = subscribe(['waiting', 'playing', 'canplay', 'emptied', 'pause', 'loadstart']);

/** Current position, updated ~4×/s by the browser's timeupdate event. Good for progress bars. */
export const useTime = () => useSyncExternalStore(subTime, () => audio.currentTime);
export const useDuration = () => useSyncExternalStore(subDuration, () => (Number.isFinite(audio.duration) ? audio.duration : 0));
export const useBuffering = () =>
  useSyncExternalStore(subWaiting, () => !audio.paused && audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);

/** Frame-accurate position for lyrics (only runs while mounted and playing). */
export function usePreciseTime() {
  const [time, setTime] = useState(() => audio.currentTime);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const t = audio.currentTime;
      if (Math.abs(t - last) > 0.04) { last = t; setTime(t); }
      raf = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(raf); setTime(audio.currentTime); };
    const sync = () => setTime(audio.currentTime); // paused seeks still move the lyrics
    if (!audio.paused) start();
    audio.addEventListener('play', start);
    audio.addEventListener('pause', stop);
    audio.addEventListener('seeked', sync);
    audio.addEventListener('emptied', sync);
    return () => {
      cancelAnimationFrame(raf);
      audio.removeEventListener('play', start);
      audio.removeEventListener('pause', stop);
      audio.removeEventListener('seeked', sync);
      audio.removeEventListener('emptied', sync);
    };
  }, []);
  return time;
}

export function formatTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
