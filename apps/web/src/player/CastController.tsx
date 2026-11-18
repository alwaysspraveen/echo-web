import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { castBridge, useCast, type CastMediaInfo, type CastStatus } from '@/lib/cast';
import { audio, isInternalSeek, markInternalSeek, setCastSilenced } from './audio';
import { useCurrentTrack, usePlayer } from './store';
import type { Track } from '@echo/shared';

/** 1080×1080 artwork for the TV, as Android does (thumbnailUrl.resize(1080, 1080)). */
const bigArt = (url?: string) => url?.replace(/=w\d+-h\d+/, '=w1080-h1080').replace(/=s\d+/, '=s1080');

const toMedia = (t: Track): CastMediaInfo => ({
  videoId: t.id,
  title: t.title,
  artist: t.artists.map((a) => a.name).join(', '),
  album: t.album?.name,
  artwork: bigArt(t.thumbnail),
  duration: t.duration,
});

/**
 * Keeps a Cast device and the app in step. The app's own player keeps running silently in sync,
 * so the progress bar, lyrics, queue, auto-next and Listen Together work exactly as usual; play,
 * pause, seek, song changes and volume are sent to the device, and the app follows the device's
 * position. When casting ends, playback carries on here from the same spot.
 */
export function CastController() {
  const status = useCast((s) => s.status);
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const connected = status.state === 'connected';
  const loadedId = useRef<string | null>(null);
  /** Ignore device play/pause reports right after we sent a command. */
  const commandAt = useRef(0);
  const cmd = (fn: () => void) => { commandAt.current = performance.now(); fn(); };

  // Device list and status from the desktop app.
  useEffect(() => {
    if (!castBridge) return;
    let lastError = '';
    const offDevices = castBridge.onDevices((devices) => useCast.setState({ devices }));
    const offStatus = castBridge.onStatus((s: CastStatus) => {
      const prev = useCast.getState().status;
      useCast.setState({ status: s, statusAt: performance.now() });
      if (s.error && s.error !== lastError && s.state === 'idle') toast.error(s.error);
      lastError = s.error ?? '';
      if (prev.state !== 'connected' && s.state === 'connected') toast.success(`Casting to ${s.device?.name ?? 'device'}`);
    });
    castBridge.status().then((s) => useCast.setState({ status: s, statusAt: performance.now() })).catch(() => {});
    return () => { offDevices(); offStatus(); };
  }, []);

  // Silence the app while casting; hand playback back when casting ends.
  useEffect(() => {
    setCastSilenced(connected);
    if (!connected) loadedId.current = null;
  }, [connected]);

  // Song changes (and the first song after connecting) load on the device.
  useEffect(() => {
    if (!connected || !castBridge || !track || loadedId.current === track.id) return;
    loadedId.current = track.id;
    commandAt.current = performance.now();
    castBridge.load(toMedia(track), audio.currentTime || 0, usePlayer.getState().playing);
  }, [connected, track]);

  // Play / pause.
  useEffect(() => {
    if (!connected || !castBridge || !loadedId.current) return;
    cmd(() => (playing ? castBridge!.play() : castBridge!.pause()));
  }, [connected, playing]);

  // Volume (the app's volume slider controls the device, as on Android).
  useEffect(() => {
    if (!connected || !castBridge) return;
    castBridge.setVolume(muted ? 0 : volume);
  }, [connected, volume, muted]);

  // Seeks made in the app go to the device.
  useEffect(() => {
    if (!connected || !castBridge) return;
    const onSeeked = () => { if (!isInternalSeek()) cmd(() => castBridge!.seek(audio.currentTime)); };
    audio.addEventListener('seeked', onSeeked);
    return () => audio.removeEventListener('seeked', onSeeked);
  }, [connected]);

  // Follow the device: its position, and play/pause from its own remote or the Google Home app.
  useEffect(() => {
    if (!connected || status.videoId !== loadedId.current) return;
    const recent = performance.now() - commandAt.current < 2000;
    if (!recent && (status.playerState === 'PAUSED' || status.playerState === 'PLAYING')) {
      const devicePlaying = status.playerState === 'PLAYING';
      if (devicePlaying !== usePlayer.getState().playing) usePlayer.getState().setPlaying(devicePlaying);
    }
    if (typeof status.currentTime === 'number' && status.playerState !== 'BUFFERING' && !recent) {
      const elapsed = status.playerState === 'PLAYING' ? (performance.now() - useCast.getState().statusAt) / 1000 : 0;
      const deviceTime = status.currentTime + elapsed;
      if (Math.abs(deviceTime - audio.currentTime) > 1.5 && Number.isFinite(audio.duration) && deviceTime < audio.duration - 1) {
        markInternalSeek();
        audio.currentTime = deviceTime;
      }
    }
  }, [connected, status]);

  return null;
}
