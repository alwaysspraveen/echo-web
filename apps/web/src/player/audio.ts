import { useEffect, useState, useSyncExternalStore } from 'react';

/** The one audio element for the whole app. */
export const audio = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
if (audio) audio.preload = 'auto';

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
