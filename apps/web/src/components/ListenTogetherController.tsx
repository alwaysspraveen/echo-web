import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Track } from '@resona/shared';
import { fromVibe, ltCanControl, ltIsHost, resumeRoom, serverNow, suggest, toVibe, useLt, vibe, type Timeline } from '@/lib/listenTogether';
import { audio, isInternalSeek, markInternalSeek, seek } from '@/player/audio';
import { usePlayer } from '@/player/store';

// The Vibe follower. The server owns the room's timeline; this makes the local player follow it,
// on every device (the host's too), and turns local clicks into requests to the server.

const ids = (q: Track[]) => q.map((t) => t.id).join(',');
const current = () => { const p = usePlayer.getState(); return p.index >= 0 ? p.queue[p.index] : undefined; };
const timeline = () => useLt.getState().timeline;
const inRoom = () => !!useLt.getState().session;

// True while we change the player ourselves, so those changes aren't sent back as requests.
let applying = false;
function setPlayer(patch: Partial<ReturnType<typeof usePlayer.getState>>) {
  applying = true;
  try { usePlayer.setState(patch); } finally { applying = false; }
}

// ----- which song the audio element really holds -----
// Set from the element itself: cleared whenever the player's song changes (from any source), and
// set to the current song when its audio has loaded. So "ready" can't refer to the previous song.
let loadedFor: string | null = null;
const audioReadyFor = (id: string) => loadedFor === id && audio.readyState >= HTMLMediaElement.HAVE_METADATA;

// How long from "play" until sound leaves the speakers / headphones (Bluetooth adds 100–300 ms).
let latencyCtx: AudioContext | null = null;
const outputDelay = () => {
  try {
    latencyCtx ??= new AudioContext({ latencyHint: 'playback' });
    const s = (latencyCtx.outputLatency || 0) + (latencyCtx.baseLatency || 0);
    return Number.isFinite(s) && s >= 0 && s < 0.6 ? s : 0;
  } catch { return 0; }
};
// How long our seeks take to land (measured), so a correction aims a little ahead.
let seekCost = 0.15;
let ourSeekAt = 0;
function jump(seconds: number) {
  ourSeekAt = Date.now();
  markInternalSeek();
  const started = performance.now();
  audio.addEventListener('seeked', () => { seekCost = Math.min(1, Math.max(0.03, 0.7 * seekCost + 0.3 * (performance.now() - started) / 1000)); }, { once: true });
  seek(seconds);
}

/** True when the room (or our audio) has reached the end of the song. */
const atSongEnd = (tl: Timeline) => audio.ended || (Number.isFinite(audio.duration) && roomPosition(tl) >= audio.duration - 0.3);

/** Where the room is right now, in seconds into the song. */
function roomPosition(tl: Timeline) {
  const now = serverNow();
  return (tl.status === 'playing' && now > tl.at ? tl.pos + (now - tl.at) : tl.pos) / 1000;
}

let readySentFor = -1;
// After our own seek request, don't correct until the room's new position arrives.
let holdUntil = 0;
// When the player last switched songs (to spot a song that never loads).
let songChangedAt = 0;
let startTimer: number | undefined;
let startTimerSeq = -1;

/** Make the player match the timeline. Safe to call any time. */
function reconcile() {
  const tl = timeline();
  if (!tl || !inRoom()) return;
  const want = tl.queue[tl.index];
  const cur = current();
  if (!want || !cur || cur.id !== want.id) return;
  const ready = audioReadyFor(want.id);

  if (tl.status !== 'playing') {
    clearTimeout(startTimer); startTimerSeq = -1;
    if (usePlayer.getState().playing) setPlayer({ playing: false });
    if (!audio.paused) audio.pause();
    audio.playbackRate = 1;
    if (ready && Math.abs(audio.currentTime - tl.pos / 1000) > 0.3) jump(tl.pos / 1000);
    // Tell the server we can start this song.
    if (tl.status === 'loading' && ready && readySentFor !== tl.seq && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      readySentFor = tl.seq;
      vibe.ready(tl.seq);
    }
    return;
  }

  // Playing.
  if (!ready) { if (usePlayer.getState().playing) setPlayer({ playing: false }); return; } // starts once loaded (loadedmetadata → reconcile)
  const untilStart = tl.at - serverNow(); // ms until the scheduled start
  if (untilStart > 0) {
    // Scheduled start: wait at the start position, then play so the sound comes out exactly on time.
    if (!audio.paused) { setPlayer({ playing: false }); audio.pause(); }
    if (Math.abs(audio.currentTime - tl.pos / 1000) > 0.05) jump(tl.pos / 1000);
    if (startTimerSeq !== tl.seq) {
      clearTimeout(startTimer);
      startTimerSeq = tl.seq;
      startTimer = window.setTimeout(() => {
        if (timeline()?.seq !== tl.seq) return;
        setPlayer({ playing: true });
        audio.play().catch(() => {});
      }, Math.max(0, untilStart - outputDelay() * 1000));
    }
    return;
  }
  // At the very end of the song: wait for the server to move the room on. (Pressing play on a
  // finished song would restart it from 0:00.)
  if (atSongEnd(tl)) return;
  // Already running: be at the right spot and playing.
  const target = roomPosition(tl) + outputDelay();
  if (Math.abs(audio.currentTime - target) > 0.3) jump(target + (audio.paused ? 0 : seekCost));
  if (!usePlayer.getState().playing) setPlayer({ playing: true });
  if (audio.paused) audio.play().catch(() => {});
}

let startedRoom = false;
/** Copy the timeline's queue and song into the player. */
function applyTimeline(tl: Timeline) {
  // A new, empty Vibe: the host's current song (and spot) becomes the room's.
  if (tl.status === 'idle' && !tl.queue.length) {
    const cur = current();
    if (ltIsHost() && cur && !startedRoom) {
      startedRoom = true;
      const p = usePlayer.getState();
      vibe.load(p.queue, p.index, audio.currentTime * 1000);
      if (!p.playing) setTimeout(() => vibe.pause(), 50);
    }
    return;
  }
  const q = tl.queue.map(fromVibe);
  const want = q[tl.index];
  if (!want) return;
  const p = usePlayer.getState();
  if (ids(p.queue) !== ids(q) || p.index !== tl.index) setPlayer({ queue: q, index: tl.index, playing: false, shuffle: false, unshuffled: null, radioFor: null });
  reconcile();
}

/**
 * Bridges the local player and a Vibe room. Renders nothing.
 */
export function ListenTogetherController() {
  const active = useLt((s) => !!s.session && s.status === 'live');

  useEffect(() => { resumeRoom(); }, []);

  useEffect(() => {
    if (!active) return;
    // Whatever is loaded right now belongs to the current song.
    loadedFor = audio.readyState >= HTMLMediaElement.HAVE_METADATA ? current()?.id ?? null : null;
    startedRoom = false;
    const onLoaded = () => { loadedFor = current()?.id ?? null; reconcile(); };
    audio.addEventListener('loadedmetadata', onLoaded);
    const unsubSong = usePlayer.subscribe((s, prev) => {
      if ((s.queue[s.index]?.id ?? null) !== (prev.queue[prev.index]?.id ?? null)) { loadedFor = null; songChangedAt = Date.now(); }
    });

    // Server timeline → player.
    const unsubTl = useLt.subscribe((s, prev) => { if (s.timeline && s.timeline !== prev.timeline) applyTimeline(s.timeline); });
    if (timeline()) applyTimeline(timeline()!);

    // Player (local clicks) → requests.
    const unsubPlayer = usePlayer.subscribe((s, prev) => {
      if (applying || !inRoom()) return;
      const curChanged = (s.queue[s.index]?.id ?? null) !== (prev.queue[prev.index]?.id ?? null);
      const queueChanged = ids(s.queue) !== ids(prev.queue);
      const playChanged = s.playing !== prev.playing;
      if (!curChanged && !queueChanged && !playChanged) return;

      if (!ltCanControl()) {
        // Friends: songs they add become suggestions to the host; anything else snaps back.
        const added = s.queue.filter((t) => !prev.queue.some((x) => x.id === t.id));
        if (added.length && !curChanged) {
          for (const t of added) suggest(toVibe(t));
          toast(added.length > 1 ? `Suggested ${added.length} songs to the host` : `Suggested "${added[0].title}" to the host`);
        } else if (curChanged || playChanged) toast('Only the host can change what plays', { id: 'vibe-host-only' });
        setPlayer({ queue: prev.queue, index: prev.index, playing: prev.playing });
        reconcile();
        return;
      }

      if (curChanged) {
        // New song: everyone loads it and starts together (the server decides when).
        vibe.load(s.queue, s.index);
        setPlayer({ playing: false });
        return;
      }
      if (queueChanged) vibe.queue(s.queue, s.index);
      if (playChanged) {
        if (s.playing) vibe.play(); else vibe.pause();
        setPlayer({ playing: prev.playing }); // the server's timeline will apply it, for everyone at once
        reconcile();
      }
    });

    // Seeks by the user: caught as they start (before the sync loop could pull them back). The
    // host's go to the room (everyone jumps together); anyone else's are undone by following it.
    const onSeeked = () => {
      if (Date.now() - ourSeekAt < 1500 || isInternalSeek()) return;
      const tl = timeline();
      if (tl && (audio.ended || (tl.status === 'playing' && atSongEnd(tl)))) return;
      if (ltCanControl()) { holdUntil = Date.now() + 2000; vibe.seek(audio.currentTime * 1000); }
      else reconcile();
    };
    const onCanPlay = () => reconcile();
    audio.addEventListener('seeking', onSeeked);
    audio.addEventListener('canplay', onCanPlay);

    // Stay on the room's timeline: ignore < 30 ms; 30–300 ms → up to 3% faster/slower (inaudible);
    // more than 300 ms → jump (reconcile).
    const steer = window.setInterval(() => {
      const tl = timeline();
      if (Date.now() < holdUntil) return;
      const want = tl?.queue[tl.index];
      // A song that hasn't loaded after 6 s (stuck download): reload it; we then join at the room's spot.
      if (want && current()?.id === want.id && !audioReadyFor(want.id) && songChangedAt && Date.now() - songChangedAt > 6000) {
        songChangedAt = Date.now();
        const src = (audio.getAttribute('src') || '').replace(/&retry=\d+$/, '');
        if (src && !src.startsWith('blob:')) { audio.src = `${src}${src.includes('?') ? '&' : '?'}retry=${Date.now()}`; audio.load(); }
        return;
      }
      if (!tl || tl.status !== 'playing' || serverNow() < tl.at) { if (audio.playbackRate !== 1) audio.playbackRate = 1; return; }
      if (atSongEnd(tl)) { if (audio.playbackRate !== 1) audio.playbackRate = 1; return; }
      if (!want || !audioReadyFor(want.id) || audio.paused) { reconcile(); return; }
      const diff = roomPosition(tl) + outputDelay() - audio.currentTime; // + means we're behind
      const abs = Math.abs(diff);
      if (abs > 0.3) { audio.playbackRate = 1; reconcile(); }
      else if (abs > 0.03) audio.playbackRate = 1 + Math.max(-0.03, Math.min(0.03, diff * 0.5));
      else if (audio.playbackRate !== 1) audio.playbackRate = 1;
    }, 250);

    return () => {
      unsubTl(); unsubPlayer(); unsubSong();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('seeking', onSeeked);
      audio.removeEventListener('canplay', onCanPlay);
      clearInterval(steer); clearTimeout(startTimer);
      audio.playbackRate = 1;
      readySentFor = -1; startTimerSeq = -1;
    };
  }, [active]);

  return null;
}
