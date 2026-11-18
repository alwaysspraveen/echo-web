import { useEffect, useRef, useState } from 'react';
import { Loader2, Minimize, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { PlayPauseButton } from './PlayPauseButton';
import { audio, formatTime, seek, useBuffering, useDuration, useTime } from '@/player/audio';
import { useCurrentTrack, usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';

/** True while `el` is the full-screen element. */
export function useIsFullscreen(el: React.RefObject<HTMLElement | null>) {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!el.current && document.fullscreenElement === el.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [el]);
  return fs;
}

export function toggleFullscreen(el: HTMLElement | null) {
  if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else el.requestFullscreen().catch(() => {});
}

function Btn({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={cn('grid size-11 place-items-center rounded-full text-white hover:bg-white/15', className)}>
      {children}
    </button>
  );
}

/**
 * YouTube-style controls over a full-screen video: title on top, seek bar and buttons at the
 * bottom. They hide (with the cursor) after 3 s without mouse movement while playing.
 */
export function VideoFullscreenControls({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const track = useCurrentTrack();
  const p = usePlayer();
  const time = useTime();
  const duration = useDuration();
  const buffering = useBuffering();
  const [drag, setDrag] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef(0);

  const poke = () => {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => !audio.paused && setVisible(false), 3000);
  };

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    poke();
    el.addEventListener('pointermove', poke);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, [role=slider]')) return;
      const k = e.key.toLowerCase();
      const p = usePlayer.getState();
      if (k === ' ' || k === 'k') { e.preventDefault(); p.togglePlay(); }
      else if (k === 'arrowright' || k === 'l') seek(audio.currentTime + (k === 'l' ? 10 : 5));
      else if (k === 'arrowleft' || k === 'j') seek(audio.currentTime - (k === 'j' ? 10 : 5));
      else if (k === 'arrowup') { e.preventDefault(); p.setVolume(Math.min(1, p.volume + 0.05)); }
      else if (k === 'arrowdown') { e.preventDefault(); p.setVolume(Math.max(0, p.volume - 0.05)); }
      else if (k === 'm') p.toggleMute();
      else if (k === 'n' && e.shiftKey) p.next();
      else if (k === 'p' && e.shiftKey) p.prev(audio.currentTime);
      else return;
      poke();
    };
    window.addEventListener('keydown', onKey);
    const showOnPause = () => setVisible(true);
    audio.addEventListener('pause', showOnPause);
    return () => {
      el.removeEventListener('pointermove', poke);
      window.removeEventListener('keydown', onKey);
      audio.removeEventListener('pause', showOnPause);
      clearTimeout(hideTimer.current);
    };
  }, [target]);

  // Hide the cursor together with the controls.
  useEffect(() => {
    const el = target.current;
    if (el) el.style.cursor = visible ? '' : 'none';
    return () => { if (el) el.style.cursor = ''; };
  }, [visible, target]);

  const shown = drag ?? time;
  const VolumeIcon = p.muted || p.volume === 0 ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className={cn('pointer-events-none absolute inset-0 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')}>
      {buffering && <Loader2 className="absolute top-1/2 left-1/2 size-12 -translate-1/2 animate-spin text-white/80" />}

      <div className="pointer-events-auto absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent px-8 pt-6 pb-16">
        <p className="truncate font-display text-2xl font-bold text-white">{track?.title}</p>
        <p className="truncate text-white/70">{track?.artists.map((a) => a.name).join(', ')}</p>
      </div>

      <div className={cn('absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-6 pt-20 pb-4', visible && 'pointer-events-auto')}>
        <Slider
          aria-label="Seek"
          value={[duration ? shown : 0]}
          max={duration || 1}
          step={0.5}
          disabled={!duration}
          onValueChange={([v]) => { setDrag(v); poke(); }}
          onValueCommit={([v]) => { seek(v); setDrag(null); }}
          className="py-2"
        />
        <div className="mt-1 flex items-center gap-1 text-white">
          <Btn label="Previous (Shift+P)" onClick={() => p.prev(audio.currentTime)}><SkipBack className="size-5 fill-current" /></Btn>
          <PlayPauseButton playing={p.playing} onClick={p.togglePlay} size={46} fill="#fff" iconClass="text-black" className="mx-1" />
          <Btn label="Next (Shift+N)" onClick={() => p.next()}><SkipForward className="size-5 fill-current" /></Btn>
          <div className="group/vol flex items-center">
            <Btn label="Mute (M)" onClick={p.toggleMute}><VolumeIcon className="size-5" /></Btn>
            <Slider
              aria-label="Volume"
              value={[p.muted ? 0 : p.volume]}
              max={1}
              step={0.01}
              onValueChange={([v]) => p.setVolume(v)}
              className="w-0 opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100 focus-within:w-24 focus-within:opacity-100"
            />
          </div>
          <span className="ml-3 text-sm tabular-nums text-white/85">{formatTime(shown)} / {formatTime(duration)}</span>
          <Btn label="Exit full screen (F)" onClick={() => toggleFullscreen(target.current)} className="ml-auto">
            <Minimize className="size-5" />
          </Btn>
        </div>
      </div>
    </div>
  );
}
