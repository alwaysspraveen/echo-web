import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
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
    <div className="fixed inset-x-0 top-0 bottom-[99px] z-40 overflow-hidden bg-black animate-in fade-in-0 slide-in-from-bottom-4 duration-300" role="dialog" aria-label="Now playing">
      {track.thumbnail && (
        <img src={track.thumbnail} alt="" aria-hidden referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-[90px] saturate-150" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/80" />

      <div className="relative grid h-full grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-12 px-12 pt-6">
        <div className="flex min-h-0 flex-col">
          <Button variant="ghost" size="icon-lg" onClick={close} aria-label="Close now playing" className="-ml-2 text-white hover:bg-white/10">
            <ChevronDown className="size-6" />
          </Button>
          <div className="flex min-h-0 flex-1 flex-col justify-center pb-10">
            <Artwork src={track.thumbnail} className="aspect-square w-full max-w-[min(100%,58vh)] rounded-[28px] shadow-2xl shadow-black/50" />
            <h2 className="mt-7 line-clamp-2 font-display text-4xl font-extrabold tracking-tight text-white">{track.title}</h2>
            <ArtistLinks track={track} className="mt-1 block text-lg text-white/75" />
          </div>
        </div>
        <div className="scrollbar-thin min-h-0 overflow-y-auto [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)]">
          <LyricsView track={track} size="stage" />
        </div>
      </div>
    </div>
  );
}
