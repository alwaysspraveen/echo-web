import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type Hls from 'hls.js';
import type { Track } from '@resona/shared';
import { audio } from '@/player/audio';
import { cn } from '@/lib/utils';

/**
 * Canvas: Apple Music motion artwork for the song's album, played muted
 * and looping inside the artwork square, following play/pause. Nothing shows if there is none.
 */
export function CanvasArt({ track, className, style }: { track: Track; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const { data: url } = useQuery({
    queryKey: ['canvas', track.id],
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }) => {
      const p = new URLSearchParams({ title: track.title, artist: track.artists.map((a) => a.name).join(', ') });
      const res = await fetch(`/api/canvas?${p}`, { signal });
      return res.ok ? ((await res.json()).url as string) : null;
    },
  });

  useEffect(() => {
    const v = ref.current;
    setReady(false);
    if (!v || !url) return;
    let hls: Hls | null = null;
    const follow = () => { if (audio.paused) v.pause(); else v.play().catch(() => {}); };
    const onReady = () => { setReady(true); follow(); };
    v.addEventListener('canplay', onReady, { once: true });
    // Use hls.js wherever it works (Chrome/Electron say "maybe" to HLS but can't play these);
    // fall back to built-in HLS only where hls.js isn't supported (Safari on iOS).
    let cancelled = false;
    import('hls.js').then(({ default: HlsCtor }) => {
      if (cancelled) return;
      if (HlsCtor.isSupported()) {
        hls = new HlsCtor({ capLevelToPlayerSize: true });
        hls.loadSource(url);
        hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) v.src = url;
    });
    audio.addEventListener('play', follow);
    audio.addEventListener('pause', follow);
    return () => {
      audio.removeEventListener('play', follow);
      audio.removeEventListener('pause', follow);
      v.removeEventListener('canplay', onReady);
      cancelled = true;
      hls?.destroy();
      v.removeAttribute('src');
    };
  }, [url]);

  if (!url) return null;
  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      aria-hidden
      style={style}
      className={cn('pointer-events-none absolute object-cover transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}
