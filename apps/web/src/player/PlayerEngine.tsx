import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { fetchRadio, streamUrl } from '@/lib/api';
import { recordPlay, toggleLike } from '@/lib/db';
import { audio, seek } from './audio';
import { useCurrentTrack, usePlayer } from './store';

const artistLine = (names: { name: string }[]) => names.map((a) => a.name).join(', ');

/**
 * Connects the player store to the <audio> element, the OS media controls (Media Session) and
 * keyboard shortcuts. Renders nothing.
 */
export function PlayerEngine() {
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const index = usePlayer((s) => s.index);
  const queueLength = usePlayer((s) => s.queue.length);
  const repeat = usePlayer((s) => s.repeat);
  const radioFor = usePlayer((s) => s.radioFor);
  const loadedId = useRef<string | null>(null);
  const errorStreak = useRef(0);
  // Assigning a new src fires a 'pause' event on a playing element; it isn't a user pause.
  const switching = useRef(false);

  // Load a new source when the current track changes.
  useEffect(() => {
    if (!track) {
      audio.removeAttribute('src');
      audio.load();
      loadedId.current = null;
      document.title = 'Echo Music';
      return;
    }
    if (loadedId.current === track.id) return;
    const restoring = loadedId.current === null && !usePlayer.getState().playing; // page reload
    loadedId.current = track.id;
    switching.current = true;
    audio.src = streamUrl(track.id);
    if (!restoring) {
      audio.play().catch(() => {});
      recordPlay(track);
    }
    document.title = `${track.title} · ${artistLine(track.artists)}`;
  }, [track]);

  // Play / pause.
  useEffect(() => {
    if (!track) return;
    if (playing && audio.paused) {
      audio.play().catch((e: DOMException) => {
        if (e.name === 'NotAllowedError') usePlayer.getState().setPlaying(false);
      });
    } else if (!playing && !audio.paused) audio.pause();
  }, [playing, track]);

  useEffect(() => {
    audio.volume = volume * volume; // perceptual curve
    audio.muted = muted;
  }, [volume, muted]);

  // When the last track starts, queue "radio" (similar songs) so music keeps going.
  useEffect(() => {
    if (!track || repeat !== 'off' || index !== queueLength - 1 || radioFor === track.id) return;
    const seed = track.id;
    fetchRadio(seed)
      .then((tracks) => {
        const cur = usePlayer.getState();
        if (cur.queue[cur.index]?.id === seed) cur.appendRadio(seed, tracks);
      })
      .catch(() => {});
  }, [track, index, queueLength, repeat, radioFor]);

  // Element events → store.
  useEffect(() => {
    const st = usePlayer.getState;
    const onEnded = () => {
      const before = st().index;
      const advanced = st().next(true);
      if (advanced && st().index === before) { audio.currentTime = 0; audio.play().catch(() => {}); } // repeat one
    };
    const onPlay = () => { switching.current = false; errorStreak.current = 0; if (!st().playing) st().setPlaying(true); };
    const onLoaded = () => { switching.current = false; };
    const onPause = () => { if (!switching.current && st().playing && !audio.ended) st().setPlaying(false); };
    const onError = () => {
      switching.current = false;
      if (!audio.getAttribute('src')) return;
      const failed = st().queue[st().index];
      errorStreak.current++;
      if (errorStreak.current >= 3) {
        st().setPlaying(false);
        toast.error('Playback stopped after several tracks failed. Check that the Echo server is running.');
        return;
      }
      toast.error(`Couldn't play "${failed?.title ?? 'this track'}". Skipping to the next one.`);
      st().next(false);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('loadeddata', onLoaded);
    return () => {
      audio.removeEventListener('loadeddata', onLoaded);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // OS media controls: keyboard media keys, Control Center, Touch Bar.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: artistLine(track.artists),
          album: track.album?.name ?? '',
          artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '544x544' }] : [],
        })
      : null;
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const st = usePlayer.getState;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => st().setPlaying(true)],
      ['pause', () => st().setPlaying(false)],
      ['nexttrack', () => st().next()],
      ['previoustrack', () => st().prev(audio.currentTime)],
      ['seekto', (d) => d.seekTime != null && seek(d.seekTime)],
      ['seekbackward', (d) => seek(audio.currentTime - (d.seekOffset ?? 10))],
      ['seekforward', (d) => seek(audio.currentTime + (d.seekOffset ?? 10))],
    ];
    for (const [a, h] of handlers) try { ms.setActionHandler(a, h); } catch { /* unsupported action */ }
    const updatePosition = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0)
        try { ms.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }); } catch { /* ignore */ }
    };
    audio.addEventListener('loadedmetadata', updatePosition);
    audio.addEventListener('seeked', updatePosition);
    audio.addEventListener('play', updatePosition);
    return () => {
      for (const [a] of handlers) try { ms.setActionHandler(a, null); } catch { /* ignore */ }
      audio.removeEventListener('loadedmetadata', updatePosition);
      audio.removeEventListener('seeked', updatePosition);
      audio.removeEventListener('play', updatePosition);
    };
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = track ? (playing ? 'playing' : 'paused') : 'none';
  }, [playing, track]);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable="true"], [role="slider"], [role="menu"], [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const st = usePlayer.getState();
      switch (e.key) {
        case ' ':
          if (el.closest('button, a')) return;
          e.preventDefault();
          st.togglePlay();
          break;
        case 'ArrowRight':
          if (e.shiftKey) st.next(); else seek(audio.currentTime + 5);
          break;
        case 'ArrowLeft':
          if (e.shiftKey) st.prev(audio.currentTime); else seek(audio.currentTime - 5);
          break;
        case 'm':
          st.toggleMute();
          break;
        case 'l': {
          const t = st.queue[st.index];
          if (t) toggleLike(t).then((liked) => toast(liked ? 'Added to Liked songs' : 'Removed from Liked songs'));
          break;
        }
        case '/':
          e.preventDefault();
          document.querySelector<HTMLInputElement>('#search-input')?.focus();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null;
}
