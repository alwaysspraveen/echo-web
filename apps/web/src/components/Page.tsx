import type { ReactNode } from 'react';
import { HardDriveDownload, Play, Shuffle } from 'lucide-react';
import { saveAllOffline } from '@/lib/offline';
import type { Track } from '@echo/shared';
import { Button } from '@/components/ui/button';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="font-display text-xl font-bold">This didn't load</p>
      <p className="mt-2 text-text-muted">{message.startsWith("Can't reach") ? `${message}.` : `${message}. Check that the Echo server is running, then try again.`}</p>
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Page loading, like Echo for Android's ContainedLoadingIndicator. */
function PageLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <LoadingIndicator contained />
    </div>
  );
}
export const ShelvesSkeleton = PageLoading;
export const CollectionSkeleton = PageLoading;

/** Header for albums and playlists: artwork, big title, play + shuffle. */
export function CollectionHeader({
  thumbnail, kind, title, subtitle, tracks, actions, downloadable = true,
}: { thumbnail?: string; kind: string; title: string; subtitle?: ReactNode; tracks: Track[]; actions?: ReactNode; downloadable?: boolean }) {
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
        {downloadable && tracks.length > 0 && (
          <Button size="lg" variant="ghost" onClick={() => saveAllOffline(tracks, title)} title="Save every song for offline play"><HardDriveDownload />Download</Button>
        )}
        {actions}
      </div>
    </div>
  );
}
