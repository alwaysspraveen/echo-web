import { useEffect, useRef } from 'react';
import { ChevronDown, Maximize } from 'lucide-react';
import { useCurrentTrack, useUi } from '@/player/store';
import { Button } from '@/components/ui/button';
import { Artwork } from './Artwork';
import { VideoStage } from './VideoStage';
import { toggleFullscreen, useIsFullscreen, VideoFullscreenControls } from './VideoFullscreen';
import { CanvasArt } from './CanvasArt';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { LyricsView } from './LyricsView';
import { ArtistLinks } from './TrackList';

/**
 * Full-window "now playing" stage: the artwork blurred deep behind everything (the web take on
 * Echo's full-screen player glass), artwork on the left, big synced lyrics on the right.
 */
export function NowPlaying() {
  const open = useUi((s) => s.nowPlaying);
  const close = () => useUi.getState().setNowPlaying(false);
  const track = useCurrentTrack();
  const videoMode = useUi((s) => s.videoMode);
  const canvasOn = useSettings((s) => s.canvas);
  const videoBox = useRef<HTMLDivElement>(null);
  const fullscreen = useIsFullscreen(videoBox);

  useEffect(() => {
    if (!open) return;
    let fsExitAt = 0;
    const onFs = () => { if (!document.fullscreenElement) fsExitAt = performance.now(); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      // Esc that leaves full screen shouldn't also close the player.
      if (e.key === 'Escape' && !document.fullscreenElement && performance.now() - fsExitAt > 400) close();
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && useUi.getState().videoMode) toggleFullscreen(videoBox.current);
    };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Leave full screen when the player closes or switches back to the song.
  useEffect(() => {
    if ((!open || !videoMode) && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [open, videoMode]);

  if (!open || !track) return null;

  return (
    <div className="no-drag fixed inset-0 z-40 overflow-hidden bg-black animate-in fade-in-0 slide-in-from-bottom-4 duration-300" role="dialog" aria-label="Now playing">
      {track.thumbnail && (
        <img src={track.thumbnail} alt="" aria-hidden referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-[90px] saturate-150" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/80" />

      {/* On macOS desktop the window buttons sit top-left; .np-stage moves content below them. */}
      <div className="drag-area absolute inset-x-0 top-0 h-14" aria-hidden />
      {/* Song / Video switch, like the Android player. */}
      <div className="absolute top-5 left-1/2 z-10 flex -translate-x-1/2 rounded-full bg-white/10 p-1 backdrop-blur" role="radiogroup" aria-label="Show">
        {([['Song', false], ['Video', true]] as const).map(([label, on]) => (
          <button
            key={label}
            role="radio"
            aria-checked={videoMode === on}
            onClick={() => useUi.getState().setVideoMode(on)}
            className={cn('h-8 rounded-full px-4 text-sm font-semibold', videoMode === on ? 'bg-white text-black' : 'text-white/80 hover:text-white')}
          >
            {label}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="icon-lg" onClick={close} aria-label="Close now playing" className="absolute top-5 right-6 z-10 text-white hover:bg-white/10">
        <ChevronDown className="size-6" />
      </Button>
      <div className="np-stage relative grid h-full grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-12 px-12 pt-6 pb-[108px]">
        {/* Rows: artwork (takes what's left) / title. The text never shrinks. */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] pb-8">
          {/* Size container: the artwork is the largest square that fits both width and height. */}
          <div className="flex min-h-0 items-end py-5" style={{ containerType: 'size' }}>
            {videoMode ? (
              <div
                ref={videoBox}
                onDoubleClick={() => toggleFullscreen(videoBox.current)}
                className={cn('group relative', fullscreen && 'size-full bg-black')}
              >
                <VideoStage
                  trackId={track.id}
                  className={fullscreen ? 'size-full' : 'aspect-video rounded-[20px] shadow-2xl shadow-black/50'}
                  style={fullscreen ? undefined : { width: 'min(100cqw, calc(100cqh * 16 / 9), 960px)' }}
                />
                {fullscreen ? (
                  <VideoFullscreenControls target={videoBox} />
                ) : (
                  <button
                    onClick={() => toggleFullscreen(videoBox.current)}
                    aria-label="Full screen (F)"
                    title="Full screen (F)"
                    className="absolute right-3 bottom-3 grid size-10 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Maximize className="size-5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative" style={{ width: 'min(100cqw, 100cqh, 640px)', height: 'min(100cqw, 100cqh, 640px)' }}>
                <Artwork src={track.thumbnail} className="size-full rounded-[28px] shadow-2xl shadow-black/50" />
                {canvasOn && <CanvasArt track={track} className="inset-0 size-full rounded-[28px]" />}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-2 pb-1 font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-tight text-white">{track.title}</h2>
            <ArtistLinks track={track} className="block pb-1 text-lg leading-snug text-white/75" />
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 overflow-y-auto [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)]">
          <LyricsView track={track} size="stage" />
        </div>
      </div>
    </div>
  );
}
