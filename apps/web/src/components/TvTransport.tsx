import { useEffect, useRef, useState } from 'react';
import { Heart, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { audio, formatTime, seek, useDuration, useTime } from '@/player/audio';
import { useCurrentTrack, usePlayer } from '@/player/store';
import { toggleLike, useIsLiked } from '@/lib/db';
import { PlayPauseButton } from './PlayPauseButton';
import { cn } from '@/lib/utils';

/**
 * Android TV playback controls in the Now Playing view (the TV has no bottom player bar, as in
 * Spotify's TV app): progress, then large buttons the remote can reach. Play/pause gets focus
 * when the view opens.
 */
export function TvTransport() {
  const track = useCurrentTrack();
  const p = usePlayer();
  const time = useTime();
  const duration = useDuration();
  const liked = useIsLiked(track?.id);
  const [drag, setDrag] = useState<number | null>(null);
  const playRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => playRef.current?.querySelector('button')?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  if (!track) return null;
  const btn = 'grid size-14 place-items-center rounded-full text-white/85 hover:bg-white/10';
  const shown = drag ?? time;
  return (
    <div className="mt-5">
      <Slider
        aria-label="Seek"
        value={[duration ? shown : 0]}
        max={duration || 1}
        step={5}
        disabled={!duration}
        onValueChange={([v]) => setDrag(v)}
        onValueCommit={([v]) => { seek(v); setDrag(null); }}
        className="py-2"
      />
      <div className="mt-1 flex justify-between text-sm tabular-nums text-white/70">
        <span>{formatTime(shown)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button aria-label={liked ? 'Remove from liked songs' : 'Like'} aria-pressed={liked} onClick={() => toggleLike(track)} className={btn}>
          <Heart className={cn('size-6', liked && 'fill-seed text-seed')} />
        </button>
        <button aria-label={p.shuffle ? 'Shuffle on' : 'Shuffle off'} aria-pressed={p.shuffle} onClick={p.toggleShuffle} className={cn(btn, p.shuffle && 'text-seed-soft')}>
          <Shuffle className="size-6" />
        </button>
        <button aria-label="Previous" onClick={() => p.prev(audio.currentTime)} className={btn}>
          <SkipBack className="size-7 fill-current" />
        </button>
        <div ref={playRef}>
          <PlayPauseButton playing={p.playing} onClick={p.togglePlay} size={76} fill="#fff" iconClass="text-black" />
        </div>
        <button aria-label="Next" onClick={() => p.next()} className={btn}>
          <SkipForward className="size-7 fill-current" />
        </button>
        <button
          aria-label={p.repeat === 'off' ? 'Repeat off' : p.repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          aria-pressed={p.repeat !== 'off'}
          onClick={p.cycleRepeat}
          className={cn(btn, p.repeat !== 'off' && 'text-seed-soft')}
        >
          {p.repeat === 'one' ? <Repeat1 className="size-6" /> : <Repeat className="size-6" />}
        </button>
      </div>
    </div>
  );
}
