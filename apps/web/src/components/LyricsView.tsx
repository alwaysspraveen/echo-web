import { useEffect, useRef, useState } from 'react';
import { activeLineIndex, type Track } from '@echo/shared';
import { useLyrics } from '@/lib/api';
import { seek, usePreciseTime } from '@/player/audio';
import { cn } from '@/lib/utils';

/**
 * Synced lyrics, following Echo's Music Flow treatment: the current line in ExtraBold white,
 * upcoming lines dimmed. Click a line to seek. Falls back to plain lyrics.
 */
export function LyricsView({ track, size = 'panel' }: { track: Track | undefined; size?: 'panel' | 'stage' }) {
  const { data, isLoading, isError, refetch } = useLyrics(track);
  const box = 'px-6 text-text-muted';

  if (!track) return <p className={cn(box, 'py-8')}>Play a song to see its lyrics.</p>;
  if (isLoading) return <LyricsSkeleton size={size} />;
  if (isError)
    return (
      <div className={cn(box, 'py-8')}>
        <p>Lyrics didn't load.</p>
        <button onClick={() => refetch()} className="mt-3 rounded-full bg-glass px-4 py-2 text-sm text-text hover:bg-surface-high">Try again</button>
      </div>
    );
  if (!data) return <p className={cn(box, 'py-8')}>No lyrics found for this song.</p>;
  if (!data.synced)
    return (
      <div className={cn(box, 'pb-10 whitespace-pre-line', size === 'stage' ? 'font-display text-2xl leading-relaxed font-semibold text-text' : 'text-base leading-relaxed')}>
        {data.plain}
        <p className="mt-6 text-xs text-text-faint">Lyrics from {data.source}</p>
      </div>
    );
  return <SyncedLines key={track.id} lines={data.synced} size={size} source={data.source} />;
}

function SyncedLines({ lines, size, source }: { lines: NonNullable<ReturnType<typeof useLyrics>['data']>['synced'] & object; size: 'panel' | 'stage'; source: string }) {
  const time = usePreciseTime();
  const active = activeLineIndex(lines, time + 0.15); // tiny lead so highlights land on the beat
  const container = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollTimer = useRef<number | undefined>(undefined);

  // Keep the active line in view unless the user is scrolling around.
  useEffect(() => {
    if (userScrolled || active < 0) return;
    const el = container.current?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [active, userScrolled]);

  const onWheel = () => {
    setUserScrolled(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => setUserScrolled(false), 3000);
  };

  const stage = size === 'stage';
  return (
    <div ref={container} onWheel={onWheel} onTouchMove={onWheel} className={cn('px-6', stage ? 'py-[30vh]' : 'py-[20vh]')}>
      {lines.map((l, i) => {
        const state = i === active ? 'now' : i < active ? 'past' : 'next';
        const empty = !l.text;
        return (
          <button
            key={i}
            data-line={i}
            onClick={() => seek(l.time)}
            className={cn(
              'block w-full origin-left text-left font-display font-extrabold tracking-tight transition-[color,opacity,transform] duration-300',
              stage ? 'py-2.5 text-[clamp(1.75rem,3.2vw,3rem)] leading-[1.15]' : 'py-2 text-[1.6rem] leading-tight',
              state === 'now' && 'text-white',
              state === 'next' && 'text-white/45 hover:text-white/70',
              state === 'past' && 'text-white/30 hover:text-white/60',
              state === 'now' && !stage && 'scale-[1.02]',
            )}
            aria-current={state === 'now' ? 'true' : undefined}
          >
            {empty ? <span aria-label="Instrumental">♪</span> : l.text}
          </button>
        );
      })}
      <p className="mt-10 text-xs text-text-faint">Lyrics from {source}</p>
    </div>
  );
}

function LyricsSkeleton({ size }: { size: 'panel' | 'stage' }) {
  return (
    <div className="flex flex-col gap-4 px-6 py-[20vh]" aria-label="Loading lyrics">
      {[80, 60, 72, 50, 66].map((w, i) => (
        <div key={i} className={cn('animate-pulse rounded-lg bg-glass', size === 'stage' ? 'h-10' : 'h-7')} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
