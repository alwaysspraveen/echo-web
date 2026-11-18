import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { fetchRadio, flacStreamFor, LOSSLESS_BASE, resolveExtensionStream, searchLossless, streamUrl } from '@/lib/api';
import { setSource, sourceFromStream, useNowSource } from './source';
import { COMPLETION_RATIO, recommend, recordListen, useBrainAdded } from '@/lib/brain';
import { recordPlay, toggleLike } from '@/lib/db';
import { DEFAULT_EXTENSIONS, useSettings } from '@/lib/settings';
import { getOfflineAudio } from '@/lib/offline';
import { useLt } from '@/lib/listenTogether';
import { audio, fadeIn, fadeOutCurrent, isInternalSeek, markInternalSeek, resetFade, seek, setBaseVolume } from './audio';
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
  const loadedQuality = useRef<string | null>(null);
  const quality = useSettings((s) => s.quality);
  // Object URL of a downloaded song's audio while it is the current source (null when streaming).
  const offlineUrl = useRef<string | null>(null);
  // True while the current source is an extension (FLAC / 320 kbps) stream.
  const onExtension = useRef(false);
  // FLAC Mode: songs skipped in a row because they have no FLAC version.
  const flacMisses = useRef(0);

  // Load a new source when the current track changes.
  useEffect(() => {
    if (!track) {
      audio.removeAttribute('src');
      audio.load();
      loadedId.current = null;
      document.title = 'Resona';
      return;
    }
    if (loadedId.current === track.id) return;
    const restoring = loadedId.current === null && !usePlayer.getState().playing; // page reload
    const id = track.id;
    loadedId.current = id;
    if (!restoring) recordPlay(track);
    // Downloaded songs play from the stored file (works with no network); others stream.
    getOfflineAudio(id).catch(() => undefined).then(async (blob) => {
      if (loadedId.current !== id) return; // user already moved on
      setSource({ label: blob ? 'Downloaded' : null });
      onExtension.current = false;
      // In a Vibe everyone plays the same YouTube Music audio: FLAC / 320 kbps versions can be a
      // different release (other intro or length) and switching mid-song causes hiccups, both of
      // which would put people out of sync. FLAC Mode applies again after the Vibe.
      const inVibe = !!useLt.getState().session;
      // FLAC Mode (or a song from the FLAC catalog): play only the FLAC version, never YouTube.
      if (!blob && ((useSettings.getState().flacMode && !inVibe) || track.flac)) {
        if (offlineUrl.current) { const old = offlineUrl.current; setTimeout(() => URL.revokeObjectURL(old), 20_000); offlineUrl.current = null; }
        switching.current = true;
        audio.removeAttribute('src');
        audio.load();
        setSource({ label: 'FLAC…' });
        flacStreamFor(track).catch(() => null).then((ext) => {
          if (loadedId.current !== id) return;
          if (!ext) {
            setSource({ label: null });
            flacMisses.current++;
            if (flacMisses.current >= 8) {
              flacMisses.current = 0;
              usePlayer.getState().setPlaying(false);
              toast.error('FLAC Mode: none of the next songs are available in FLAC. Try a different album or artist.');
              return;
            }
            toast(`"${track.title}" isn't available in FLAC. Skipping.`);
            usePlayer.getState().next(false);
            return;
          }
          flacMisses.current = 0;
          switching.current = true;
          audio.src = ext.url;
          onExtension.current = true;
          setSource(sourceFromStream({ format: 'flac', ...ext }));
          if (usePlayer.getState().playing) audio.play().catch(() => {}); // a song loaded paused (e.g. in a Vibe) stays paused
        });
        document.title = `${track.title} · ${artistLine(track.artists)}`;
        return;
      }
      // Extensions (Settings → Extensions): start right away from YouTube, and when an extension has
      // this song in higher quality, switch to it at the same position (seamless upgrade).
      const { extensions, preferExtension, quality } = useSettings.getState();
      // Always FLAC lossless first, then 320 kbps, then any others; YouTube if none has the song.
      const rank = (b: string) => { const i = DEFAULT_EXTENSIONS.findIndex((d) => d.base === b); return i === -1 ? DEFAULT_EXTENSIONS.length : i; };
      const bases = extensions.filter((e) => e.enabled).map((e) => e.base).sort((x, y) => rank(x) - rank(y));
      if (!blob && !inVibe && preferExtension && bases.length && quality !== 'low') {
        const isFlac = (e: { format?: string; codec?: string | null; quality?: string; audioQuality?: string } | null) =>
          !!e && /flac|lossless|hi_?res/i.test([e.format, e.codec, e.quality, e.audioQuality].join(' '));
        resolveExtensionStream(track, bases).catch(() => null).then((ext) => {
          // FLAC is preferred; if it wasn't reachable just now (its server is a free service that is
          // sometimes busy), try FLAC once more a little later and switch to it mid-song.
          if (loadedId.current === id && !isFlac(ext) && bases.includes(LOSSLESS_BASE)) {
            setTimeout(() => {
              if (loadedId.current !== id || isFlac(useNowSource.getState().label ? { quality: useNowSource.getState().label! } : null)) return;
              resolveExtensionStream(track, [LOSSLESS_BASE]).catch(() => null).then((flac) => {
                if (!flac || loadedId.current !== id) return;
                const at = audio.currentTime;
                const wasPlaying = !audio.paused || usePlayer.getState().playing;
                switching.current = true;
                audio.src = flac.url;
                onExtension.current = true;
                audio.addEventListener('loadedmetadata', () => { markInternalSeek(); audio.currentTime = at; if (wasPlaying) audio.play().catch(() => {}); }, { once: true });
                setSource(sourceFromStream({ format: 'flac', ...flac }));
              });
            }, 20_000);
          }
          if (!ext || loadedId.current !== id) return;
          const at = audio.currentTime;
          const wasPlaying = !audio.paused || usePlayer.getState().playing;
          switching.current = true;
          audio.src = ext.url;
          onExtension.current = true;
          audio.addEventListener('loadedmetadata', () => { markInternalSeek(); audio.currentTime = at; if (wasPlaying) audio.play().catch(() => {}); }, { once: true });
          setSource(sourceFromStream(ext));
        });
      }
      // Release the previous downloaded file later: a crossfade may still be playing its tail.
      if (offlineUrl.current) { const old = offlineUrl.current; setTimeout(() => URL.revokeObjectURL(old), 20_000); offlineUrl.current = null; }
      switching.current = true;
      loadedQuality.current = useSettings.getState().quality;
      if (blob) audio.src = offlineUrl.current = URL.createObjectURL(blob);
      else audio.src = streamUrl(id, loadedQuality.current);
      if (usePlayer.getState().playing) audio.play().catch(() => {}); // a song loaded paused (e.g. in a Vibe) stays paused
    });
    document.title = `${track.title} · ${artistLine(track.artists)}`;
  }, [track]);

  // Quality changed mid-song: reload the stream at the same position.
  useEffect(() => {
    if (!track || loadedId.current !== track.id || loadedQuality.current === quality) return;
    loadedQuality.current = quality;
    if (offlineUrl.current || useNowSource.getState().label) return; // downloaded file or extension stream: quality doesn't apply
    const at = audio.currentTime;
    const wasPlaying = !audio.paused;
    switching.current = true;
    audio.src = streamUrl(track.id, quality);
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = at; if (wasPlaying) audio.play().catch(() => {}); }, { once: true });
  }, [quality, track]);

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
    setBaseVolume(volume * volume); // perceptual curve
    audio.muted = muted;
  }, [volume, muted]);

  // Resona Brain stats: listening time per song, and a skip when you move on before 85%.
  useEffect(() => {
    let current = usePlayer.getState().queue[usePlayer.getState().index];
    let listened = 0;
    let lastT = audio.currentTime;
    let ended = false;
    const onTime = () => {
      const d = audio.currentTime - lastT;
      lastT = audio.currentTime;
      if (!audio.paused && d > 0 && d < 1.5) listened += d * 1000; // ignore seeks
    };
    const onEnded = () => { ended = true; };
    const flush = () => {
      if (!current) return;
      const duration = (current.duration ?? audio.duration) * 1000;
      const skipped = !ended && duration > 0 && listened / duration < COMPLETION_RATIO && listened > 0;
      recordListen(current, listened, skipped).catch(() => {});
    };
    const unsub = usePlayer.subscribe((s) => {
      const t = s.queue[s.index];
      if (t?.id === current?.id) return;
      flush();
      current = t; listened = 0; ended = false; lastT = 0;
    });
    const onSeeked = () => { lastT = audio.currentTime; };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('seeked', onSeeked);
    window.addEventListener('pagehide', flush);
    return () => { unsub(); audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('ended', onEnded); audio.removeEventListener('seeked', onSeeked); window.removeEventListener('pagehide', flush); };
  }, []);

  // Crossfade (Settings → Crossfade, off by default, 5 s): near the end of a song, keep its
  // tail playing on a second player while fading it out, and fade the next song in.
  useEffect(() => {
    let triggered = false;
    const onTime = () => {
      const { crossfade, crossfadeSeconds } = useSettings.getState();
      const st = usePlayer.getState();
      if (!crossfade || triggered || !st.playing || !Number.isFinite(audio.duration) || audio.duration < crossfadeSeconds * 2) return;
      if (audio.duration - audio.currentTime > crossfadeSeconds) return;
      const hasNext = st.repeat !== 'one' && (st.index + 1 < st.queue.length || st.repeat === 'all');
      if (!hasNext) return;
      triggered = true;
      const ms = crossfadeSeconds * 1000;
      fadeOutCurrent(ms);
      st.next(true);
      const onPlaying = () => fadeIn(ms);
      audio.addEventListener('playing', onPlaying, { once: true });
    };
    const reset = () => { triggered = false; };
    const onSeek = () => { if (audio.duration - audio.currentTime > useSettings.getState().crossfadeSeconds) { triggered = false; if (!isInternalSeek()) resetFade(); } };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadstart', reset);
    audio.addEventListener('seeked', onSeek);
    return () => { audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('loadstart', reset); audio.removeEventListener('seeked', onSeek); };
  }, []);

  // When the last track starts, queue "radio" (similar songs) so music keeps going.
  useEffect(() => {
    if (!track || repeat !== 'off' || index !== queueLength - 1 || radioFor === track.id) return;
    if (useLt.getState().session) return; // in Listen Together the shared queue is the queue
    const seed = track.id;
    // FLAC catalog songs: keep going with more FLAC songs by the same artist.
    if (track.flac) {
      const artist = track.artists[0]?.name;
      if (!artist) return;
      searchLossless(artist).then((tracks) => {
        const cur = usePlayer.getState();
        const have = new Set(cur.queue.map((t) => t.id));
        if (cur.queue[cur.index]?.id === seed) cur.appendRadio(seed, tracks.filter((t) => !have.has(t.id)).slice(0, 20));
      }).catch(() => {});
      return;
    }
    // Resona Brain (Settings): add songs picked from your listening stats; otherwise plain radio.
    const pick = useSettings.getState().echoBrain
      ? recommend(track, new Set(usePlayer.getState().queue.map((t) => t.id))).then((picks) => {
          if (picks.length) useBrainAdded.setState((s) => ({ ids: new Set([...s.ids, ...picks.map((p) => p.id)]) }));
          return picks;
        })
      : fetchRadio(seed);
    pick
      .then((tracks) => {
        const cur = usePlayer.getState();
        if (cur.queue[cur.index]?.id === seed && tracks.length) cur.appendRadio(seed, tracks);
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
    let lastProgress = { t: -1, at: Date.now() };
    const watchdog = window.setInterval(() => {
      if (!onExtension.current || !st().playing || audio.paused === false && audio.currentTime !== lastProgress.t) {
        lastProgress = { t: audio.currentTime, at: Date.now() };
        return;
      }
      if (Date.now() - lastProgress.at > 8000) { lastProgress = { t: -1, at: Date.now() }; onError(); }
    }, 1000);
    const onError = () => {
      switching.current = false;
      if (!audio.getAttribute('src')) return;
      const cur = st().queue[st().index];
      // FLAC Mode never falls back to YouTube: skip the song instead.
      if (onExtension.current && cur && (useSettings.getState().flacMode || cur.flac)) {
        onExtension.current = false;
        errorStreak.current++;
        if (errorStreak.current >= 3) {
          errorStreak.current = 0;
          st().setPlaying(false);
          toast.error('The FLAC server is busy or not responding. Try again in a minute, or turn off FLAC Mode.');
          return;
        }
        toast(`"${cur.title}" couldn't play in FLAC. Skipping.`);
        st().next(false);
        return;
      }
      if (onExtension.current && cur) {
        // The FLAC / 320 kbps source stopped serving the file (e.g. 403 mid-song): keep playing
        // the same song from YouTube Music at the same position instead of skipping it.
        onExtension.current = false;
        const at = audio.currentTime;
        switching.current = true;
        setSource({ label: null });
        audio.src = streamUrl(cur.id, useSettings.getState().quality);
        audio.addEventListener('loadedmetadata', () => { markInternalSeek(); audio.currentTime = at; if (st().playing) audio.play().catch(() => {}); }, { once: true });
        return;
      }
      const failed = st().queue[st().index];
      errorStreak.current++;
      if (errorStreak.current >= 3) {
        st().setPlaying(false);
        toast.error('Playback stopped after several tracks failed. Check that the Resona server is running.');
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
      clearInterval(watchdog);
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
