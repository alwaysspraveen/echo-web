import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Track } from '@resona/shared';
import {
  fromLt, ltCanControl, ltIsHost, requestSync, suggest, resumeRoom, sendAction, sendBufferReady, serverNow, setLtListener, syncClock, toLt,
  useLt, type LtTrack, type PlaybackAction, type RoomSnapshot,
} from '@/lib/listenTogether';
import { audio, isInternalSeek, seek } from '@/player/audio';
import { usePlayer } from '@/player/store';

const ids = (q: Track[]) => q.map((t) => t.id).join(',');
const now = () => Date.now();

// True while we copy the room into the local player, so those changes aren't sent back.
let applying = false;
// The server echoes every action to everyone, including the sender. Remember what we sent.
let sent: { action: string; trackId?: string; position?: number; at: number }[] = [];
let bufferFor: string | null = null;
// Seeks we make to follow the room fire 'seeked' later; don't report those as user seeks.
let ourSeekAt = 0;
// The room's play state as we last heard it, to restore if the server refuses our change.
let roomPlaying = false;
// Where the host is: `base` ms into `trackId` at server time `at`. Guests steer toward this.
let roomRef: { trackId?: string; base: number; at: number } | null = null;
const setRef = (trackId: string | undefined, base: number, at: number | undefined) => { roomRef = { trackId: trackId ?? current()?.id, base, at: at || serverNow() }; };
/** Where the host is right now, in seconds (on the shared server clock). */
const hostPosition = () => (roomRef ? (roomRef.base + (roomPlaying ? Math.max(0, serverNow() - roomRef.at) : 0)) / 1000 : null);

function send(a: PlaybackAction) {
  sent = [...sent.filter((s) => now() - s.at < 4000), { action: a.action, trackId: a.trackId, position: a.position, at: now() }];
  sendAction(a);
}
const isOwnMessage = (a: PlaybackAction) =>
  sent.some((s) => s.action === a.action && now() - s.at < 4000 && (!s.trackId || s.trackId === a.trackId || !a.trackId) &&
    (s.position == null || a.position == null || Math.abs(s.position - a.position) < 1500));

const posMs = () => Math.round((audio.currentTime || 0) * 1000);
const current = () => { const p = usePlayer.getState(); return p.index >= 0 ? p.queue[p.index] : undefined; };

/** Seek once the current song can seek. `target` may be a function evaluated at that moment. */
function seekWhenReady(target: () => number) {
  const go = () => { const t = target(); if (Math.abs(audio.currentTime - t) > 0.3) { ourSeekAt = now(); seek(t); } };
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) go();
  else audio.addEventListener('loadedmetadata', go, { once: true });
}

/** Tell the server when the new song has loaded (the host waits for everyone before playing). */
function reportBuffered(trackId: string) {
  bufferFor = trackId;
  const ready = () => { if (bufferFor === trackId && current()?.id === trackId) { sendBufferReady(trackId); bufferFor = null; } };
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && current()?.id === trackId) ready();
  else audio.addEventListener('canplay', ready, { once: true });
}

function setPlayer(patch: Partial<ReturnType<typeof usePlayer.getState>>) {
  applying = true;
  try { usePlayer.setState(patch); } finally { applying = false; }
}

function loadQueue(track: LtTrack, queue: LtTrack[] | undefined, playing: boolean) {
  let q = (queue?.length ? queue : [track]).map(fromLt);
  let index = q.findIndex((t) => t.id === track.id);
  if (index === -1) { q = [fromLt(track), ...q]; index = 0; }
  const p = usePlayer.getState();
  if (ids(p.queue) === ids(q) && p.index === index) setPlayer({ playing });
  else setPlayer({ queue: q, index, playing, unshuffled: null, shuffle: false, radioFor: null });
  reportBuffered(track.id);
}

function applySnapshot(s: RoomSnapshot) {
  if (!s.currentTrack) return;
  roomPlaying = s.isPlaying;
  setRef(s.currentTrack.id, s.position, s.lastUpdate);
  loadQueue(s.currentTrack, s.queue, s.isPlaying);
  seekWhenReady(() => hostPosition() ?? s.position / 1000);
}

function applyAction(a: PlaybackAction) {
  if (isOwnMessage(a)) return;
  const p = usePlayer.getState();
  switch (a.action) {
    case 'change_track':
      // Load the song but wait: playback starts when the host's copy actually starts ('play').
      roomPlaying = false;
      roomRef = null;
      if (a.trackInfo?.id) { loadQueue(a.trackInfo, a.queue, false); seekWhenReady(() => (a.position ?? 0) / 1000); }
      break;
    case 'play': {
      roomPlaying = true;
      setRef(a.trackId, a.position ?? posMs(), a.serverTime);
      setPlayer({ playing: true });
      seekWhenReady(() => hostPosition() ?? 0);
      break;
    }
    case 'pause':
      roomPlaying = false;
      roomRef = null;
      audio.playbackRate = 1;
      setPlayer({ playing: false });
      if (a.position != null) seekWhenReady(() => a.position! / 1000);
      break;
    case 'seek': {
      setRef(a.trackId, a.position ?? 0, a.serverTime);
      seekWhenReady(() => hostPosition() ?? 0);
      break;
    }
    case 'tick':
      // Host heartbeat: its exact position. The drift loop below steers toward it.
      if (a.trackId && current()?.id !== a.trackId) break;
      setRef(a.trackId, a.position ?? 0, a.serverTime);
      if (!roomPlaying) { roomPlaying = true; setPlayer({ playing: true }); seekWhenReady(() => hostPosition() ?? 0); }
      break;
    case 'sync_queue':
      if (a.queue?.length) {
        const cur = current();
        let q = a.queue.map(fromLt);
        let index = cur ? q.findIndex((t) => t.id === cur.id) : 0;
        if (cur && index === -1) { q = [cur, ...q]; index = 0; }
        if (ids(q) !== ids(p.queue)) setPlayer({ queue: q, index: Math.max(0, index) });
      }
      break;
    case 'queue_add':
      if (a.trackInfo?.id && !p.queue.some((t) => t.id === a.trackInfo!.id)) {
        const q = [...p.queue];
        q.splice(a.insertNext ? p.index + 1 : q.length, 0, fromLt(a.trackInfo));
        setPlayer({ queue: q });
      }
      break;
    case 'queue_remove':
      if (a.trackId) {
        const i = p.queue.findIndex((t) => t.id === a.trackId);
        if (i > -1 && i !== p.index) setPlayer({ queue: p.queue.filter((_, j) => j !== i), index: i < p.index ? p.index - 1 : p.index });
      }
      break;
    case 'queue_clear':
      if (p.index >= 0) setPlayer({ queue: [p.queue[p.index]], index: 0 });
      break;
    case 'skip_next': applying = true; p.next(); applying = false; break;
    case 'skip_prev': applying = true; p.prev(0); applying = false; break;
  }
}

/** Sends what the room needs to know about our player: song + queue, then play/pause at our position. */
function announceCurrent() {
  const t = current();
  if (!t) return;
  const p = usePlayer.getState();
  send({ action: 'change_track', trackId: t.id, trackInfo: toLt(t), queue: p.queue.map(toLt), queueTitle: 'Resona', position: 0 });
  send({ action: p.playing ? 'play' : 'pause', position: posMs() });
}

/**
 * Bridges the local player and a Vibe room. Renders nothing.
 */
export function ListenTogetherController() {
  const active = useLt((s) => !!s.session);

  useEffect(() => {
    resumeRoom();
    setLtListener({
      onDenied: () => { setPlayer({ playing: roomPlaying }); requestSync(); },
      onAddSuggested: (t) => usePlayer.getState().addToQueue([fromLt(t)]), // host: sync_queue goes out automatically
      onAction: applyAction,
      onSnapshot: (s) => applySnapshot(s),
      onBufferComplete: () => {},
      onUserJoined: () => { if (ltIsHost()) announceCurrent(); },
    });
    return () => setLtListener(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    // Player → room.
    const unsub = usePlayer.subscribe((s, prev) => {
      if (applying) return;
      const trackChanged = (s.queue[s.index]?.id ?? null) !== (prev.queue[prev.index]?.id ?? null);
      const queueChanged = ids(s.queue) !== ids(prev.queue);
      const playChanged = s.playing !== prev.playing;
      if (!trackChanged && !queueChanged && !playChanged) return;

      if (!ltCanControl()) {
        // Guests without control: suggest added songs to the host, otherwise snap back to the room.
        const added = s.queue.filter((t) => !prev.queue.some((x) => x.id === t.id));
        if (added.length && !trackChanged) {
          for (const t of added) suggest(toLt(t));
          setPlayer({ queue: prev.queue, index: prev.index });
          toast(added.length > 1 ? `Suggested ${added.length} songs to the host` : `Suggested "${added[0].title}" to the host`);
        } else if (trackChanged && !(audio.ended || audio.duration - audio.currentTime < 1.5)) {
          toast('Only the host can change songs in this room');
          setPlayer({ queue: prev.queue, index: prev.index, playing: prev.playing }); // undo locally
          requestSync();
        } else if (playChanged && !trackChanged) {
          toast('Only the host can play or pause in this room');
          setPlayer({ playing: prev.playing }); // undo locally
        }
        return;
      }

      if (trackChanged && s.index >= 0) {
        const t = s.queue[s.index];
        // Everyone loads the song; 'play' goes out when our copy actually starts (see onPlaying).
        send({ action: 'change_track', trackId: t.id, trackInfo: toLt(t), queue: s.queue.map(toLt), queueTitle: 'Resona', position: 0 });
        return;
      }
      if (queueChanged) send({ action: 'sync_queue', queue: s.queue.map(toLt), queueTitle: 'Resona' });
      if (playChanged) send({ action: s.playing ? 'play' : 'pause', position: posMs() });
    });
    // User seeks (not the ones we make to follow the room).
    const onSeeked = () => { if (!applying && !isInternalSeek() && now() - ourSeekAt > 1200 && ltCanControl()) send({ action: 'seek', position: posMs() }); };
    audio.addEventListener('seeked', onSeeked);

    // Host: the moment our audio really starts (new song loaded, after buffering, after a FLAC
    // switch), tell everyone our exact position, so they start/align with what we actually hear.
    const onPlaying = () => {
      const t = current();
      if (ltIsHost() && t) send({ action: 'play', trackId: t.id, position: posMs() });
    };
    audio.addEventListener('playing', onPlaying);
    // Host heartbeat every 3 s while playing.
    const beat = window.setInterval(() => {
      const t = current();
      if (ltIsHost() && t && !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) sendAction({ action: 'tick', trackId: t.id, position: posMs() });
    }, 3000);
    // Guests: steer toward the host. Small drift → play up to 5% faster/slower (inaudible) until
    // aligned; more than 1 s off → jump.
    const steer = window.setInterval(() => {
      if (ltIsHost()) { if (audio.playbackRate !== 1) audio.playbackRate = 1; return; }
      const target = hostPosition();
      if (target === null || !roomPlaying || roomRef?.trackId !== current()?.id || audio.paused || audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        if (audio.playbackRate !== 1) audio.playbackRate = 1;
        return;
      }
      const diff = target - audio.currentTime; // + means we're behind
      if (Math.abs(diff) > 1) { ourSeekAt = now(); audio.playbackRate = 1; seek(target); }
      else if (Math.abs(diff) > 0.04) audio.playbackRate = 1 + Math.max(-0.05, Math.min(0.05, diff * 0.6));
      else if (audio.playbackRate !== 1) audio.playbackRate = 1;
    }, 400);
    syncClock();
    const clock = window.setInterval(syncClock, 60_000);

    return () => {
      unsub();
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('playing', onPlaying);
      clearInterval(beat); clearInterval(steer); clearInterval(clock);
      audio.playbackRate = 1;
      roomRef = null;
    };
  }, [active]);

  return null;
}
