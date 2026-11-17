import type { ReactNode } from 'react';
import { Play, Shuffle } from 'lucide-react';
import type { Track } from '@echo/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="font-display text-xl font-bold">This didn't load</p>
      <p className="mt-2 text-text-muted">{message}. Check that the Echo server is running, then try again.</p>
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function ShelvesSkeleton() {
  return (
    <div aria-label="Loading" className="px-2.5">
      {[0, 1, 2].map((r) => (
        <div key={r} className="mb-10">
          <Skeleton className="mb-4 h-7 w-56" />
          <div className="flex gap-5 overflow-hidden">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="aspect-square w-44 shrink-0 rounded-2xl" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CollectionSkeleton() {
  return (
    <div aria-label="Loading">
      <div className="flex items-end gap-7 px-2">
        <Skeleton className="size-56 rounded-[24px]" />
        <div className="flex-1 space-y-3 pb-3"><Skeleton className="h-12 w-2/3" /><Skeleton className="h-5 w-1/3" /></div>
      </div>
      <div className="mt-10 space-y-3 px-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
    </div>
  );
}

/** Header for albums and playlists: artwork, big title, play + shuffle. */
export function CollectionHeader({
  thumbnail, kind, title, subtitle, tracks, actions,
}: { thumbnail?: string; kind: string; title: string; subtitle?: ReactNode; tracks: Track[]; actions?: ReactNode }) {
  const { playList } = usePlayer();
  const shuffle = () => {
    const s = usePlayer.getState();
    if (!s.shuffle) s.toggleShuffle();
    s.playList(tracks, Math.floor(Math.random() * tracks.length));
  };
  return (
    <div className="mb-6 px-2">
      <div className="flex items-end gap-7">
        <Artwork src={thumbnail} className="size-56 rounded-[24px] shadow-2xl shadow-black/40 xl:size-60" />
        <div className="min-w-0 pb-1">
          <p className="text-sm font-medium text-text-muted">{kind}</p>
          <h1 className={cn('mt-1 line-clamp-2 font-display font-extrabold tracking-tight', title.length > 30 ? 'text-4xl' : 'text-6xl')}>{title}</h1>
          {subtitle && <div className="mt-3 text-text-muted">{subtitle}</div>}
        </div>
      </div>
      <div className="mt-6 flex items-center gap-2">
        <Button size="lg" onClick={() => playList(tracks)} disabled={!tracks.length}><Play className="fill-current" />Play</Button>
        <Button size="lg" variant="secondary" onClick={shuffle} disabled={tracks.length < 2}><Shuffle />Shuffle</Button>
        {actions}
      </div>
    </div>
  );
}
