import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { DownloadMenu, DownloadStateIcon } from './DownloadMenu';
import { useCurrentTrack, useUi } from '@/player/store';
import { Button } from '@/components/ui/button';
import { Artwork } from './Artwork';
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !track) return null;

  return (
    <div className="no-drag fixed inset-x-0 top-0 bottom-[99px] z-40 overflow-hidden bg-black animate-in fade-in-0 slide-in-from-bottom-4 duration-300" role="dialog" aria-label="Now playing">
      {track.thumbnail && (
        <img src={track.thumbnail} alt="" aria-hidden referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-[90px] saturate-150" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/80" />

      {/* On macOS desktop the window buttons sit top-left; .np-stage moves content below them. */}
      <div className="drag-area absolute inset-x-0 top-0 h-14" aria-hidden />
      <div className="np-stage relative grid h-full grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-12 px-12 pt-6">
        {/* Rows: close button / artwork (takes what's left) / title. The text never shrinks. */}
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] pb-8">
          <Button variant="ghost" size="icon-lg" onClick={close} aria-label="Close now playing" className="-ml-2 text-white hover:bg-white/10">
            <ChevronDown className="size-6" />
          </Button>
          {/* Size container: the artwork is the largest square that fits both width and height. */}
          <div className="flex min-h-0 items-end py-5" style={{ containerType: 'size' }}>
            <Artwork
              src={track.thumbnail}
              className="rounded-[28px] shadow-2xl shadow-black/50"
              style={{ width: 'min(100cqw, 100cqh, 640px)', height: 'min(100cqw, 100cqh, 640px)' }}
            />
          </div>
          <div className="min-w-0">
            <h2 className="line-clamp-2 pb-1 font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-tight text-white">{track.title}</h2>
            <div className="flex items-center justify-between gap-4">
              <ArtistLinks track={track} className="block min-w-0 pb-1 text-lg leading-snug text-white/75" />
              <DownloadMenu track={track}>
                <Button variant="ghost" className="shrink-0 bg-white/10 text-white hover:bg-white/20 data-[state=open]:bg-white/20">
                  <DownloadStateIcon track={track} />Download
                </Button>
              </DownloadMenu>
            </div>
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 overflow-y-auto [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)]">
          <LyricsView track={track} size="stage" />
        </div>
      </div>
    </div>
  );
}
