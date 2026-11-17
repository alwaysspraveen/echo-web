import { useEffect, useRef, useState } from 'react';
import { streamUrl } from '@/lib/api';
import { audio } from '@/player/audio';
import { cn } from '@/lib/utils';

/**
 * Video mode: shows the song's video (video-only stream) muted, kept in step with the audio
 * that is already playing, so switching is seamless.
 */
export function VideoStage({ trackId, className, style }: { trackId: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setFailed(false);
    const sync = () => {
      if (v.readyState < HTMLMediaElement.HAVE_METADATA) return;
      if (Math.abs(v.currentTime - audio.currentTime) > 0.35) v.currentTime = audio.currentTime;
      if (audio.paused && !v.paused) v.pause();
      if (!audio.paused && v.paused) v.play().catch(() => {});
    };
    const onMeta = () => { v.currentTime = audio.currentTime; if (!audio.paused) v.play().catch(() => {}); };
    v.addEventListener('loadedmetadata', onMeta);
    const events = ['play', 'pause', 'seeked', 'ratechange'];
    events.forEach((e) => audio.addEventListener(e, sync));
    const timer = window.setInterval(sync, 1000);
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      events.forEach((e) => audio.removeEventListener(e, sync));
      clearInterval(timer);
    };
  }, [trackId]);

  if (failed) return <div style={style} className={cn('grid place-items-center bg-black/60 text-sm text-white/70', className)}>No video for this song</div>;
  return (
    <video
      ref={ref}
      key={trackId}
      src={streamUrl(trackId, 'video')}
      muted
      playsInline
      preload="auto"
      style={style}
      onError={() => setFailed(true)}
      className={cn('bg-black object-contain', className)}
    />
  );
}
