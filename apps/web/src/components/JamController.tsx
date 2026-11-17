import { useEffect } from 'react';
import { toast } from 'sonner';
import type { Track } from '@echo/shared';
import { addToJam, canControl, isHost, pushPlayback, resumeJam, roomPosition, useJam, type JamRoom } from '@/lib/jam';
import { audio, seek } from '@/player/audio';
import { usePlayer } from '@/player/store';

const ids = (q: Track[]) => q.map((t) => t.id).join(',');
const DRIFT_S = 2.5; // re-sync when this far from the Jam's position

// True while we're copying the room into the local player, so those changes aren't sent back.
let applying = false;

/** Seek to the room's position once the current song can seek. */
function syncPosition(room: JamRoom) {
  const doSeek = () => {
    const target = roomPosition(room);
    if (Math.abs(audio.currentTime - target) > DRIFT_S) seek(target);
  };
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) doSeek();
  else audio.addEventListener('loadedmetadata', doSeek, { once: true });
}

function applyRoom(room: JamRoom) {
  applying = true;
  try {
    const p = usePlayer.getState();
    if (ids(p.queue) !== ids(room.queue)) {
      usePlayer.setState({ queue: room.queue, index: room.index, unshuffled: null, shuffle: false, radioFor: null, playing: room.playing });
    } else if (p.index !== room.index || p.playing !== room.playing) {
      usePlayer.setState({ index: room.index, playing: room.playing });
    }
  } finally {
    applying = false;
  }
  if (room.index >= 0) syncPosition(room);
}

/**
 * Keeps the local player in step with the Jam: applies room changes, sends local changes
 * (play/pause/skip/seek/queue edits), and corrects drift. Renders nothing.
 */
export function JamController() {
  const room = useJam((s) => s.room);
  const active = useJam((s) => !!s.session);

  // Rejoin after a reload.
  useEffect(() => { resumeJam(); }, []);

  // Room → player.
  useEffect(() => {
    if (room) applyRoom(room);
  }, [room?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Alex skipped" notes, like Spotify Jam.
  useEffect(() => {
    if (!room?.changedBy || room.changedBy === useJam.getState().session?.name) return;
    const t = room.queue[room.index];
    if (t) toast(`${room.changedBy} ${room.playing ? 'is playing' : 'paused'} "${t.title}"`, { id: 'jam-change', duration: 2500 });
  }, [room?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Player → room.
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const unsub = usePlayer.subscribe((s, prev) => {
      if (applying) return;
      if (s.queue === prev.queue && s.index === prev.index && s.playing === prev.playing) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => send(), 120); // coalesce bursts (e.g. playList sets several fields)
    });
    const send = async () => {
      const { room } = useJam.getState();
      if (!room) return;
      const s = usePlayer.getState();
      const roomIds = room.queue.map((t) => t.id);
      const added = s.queue.filter((t) => !roomIds.includes(t.id));
      const rest = s.queue.filter((t) => roomIds.includes(t.id));
      // Songs only appended ("Add to queue"): use the conflict-free add request.
      const onlyAppended =
        added.length > 0 && ids(rest) === ids(room.queue) && ids(s.queue.slice(0, room.queue.length)) === ids(room.queue) &&
        s.index === room.index && s.playing === room.playing;
      if (onlyAppended || (!canControl() && added.length)) {
        await addToJam(added);
        if (!canControl()) applyRoom(useJam.getState().room ?? room);
        return;
      }
      if (!canControl()) {
        // Guests without control snap back to the Jam (silently when their song just ended).
        const autoAdvance = audio.ended || (audio.duration > 0 && audio.duration - audio.currentTime < 1.5);
        if (!autoAdvance) toast('Only the host can control playback in this Jam');
        applyRoom(useJam.getState().room ?? room);
        return;
      }
      // Capture the action once: a rejected push makes us adopt the room, which changes the player.
      const snap = { queue: s.queue, index: s.index, playing: s.playing, position: audio.currentTime || 0 };
      let ok = await pushPlayback(snap);
      // Someone changed playback a moment earlier. Retry the same action on top of it, unless
      // they edited the queue (then theirs stands, so their added songs aren't lost).
      const fresh = useJam.getState().room;
      if (!ok && fresh && canControl() && ids(fresh.queue) === ids(room.queue)) ok = await pushPlayback(snap);
      if (!ok) applyRoom(useJam.getState().room ?? room);
    };
    // User seeks (not ones we made to follow the Jam).
    const onSeeked = () => {
      const { room } = useJam.getState();
      if (!room || applying || room.index < 0) return;
      if (Math.abs(audio.currentTime - roomPosition(room)) > DRIFT_S) send();
    };
    audio.addEventListener('seeked', onSeeked);
    // Drift correction for guests (the host's player is the reference).
    const drift = window.setInterval(() => {
      const { room } = useJam.getState();
      if (!room?.playing || isHost() || audio.paused || audio.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const target = roomPosition(room);
      if (Math.abs(audio.currentTime - target) > DRIFT_S) { applying = true; seek(target); applying = false; }
    }, 4000);
    return () => { unsub(); clearTimeout(timer); clearInterval(drift); audio.removeEventListener('seeked', onSeeked); };
  }, [active]);

  return null;
}
