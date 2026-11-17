import { Link } from 'react-router';
import { AudioLines, Heart, MoreHorizontal, Play } from 'lucide-react';
import type { Track } from '@echo/shared';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useIsLiked } from '@/lib/db';
import { formatTime } from '@/player/audio';
import { useCurrentTrack, usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';
import { TrackMenuItems } from './TrackMenu';

export function ArtistLinks({ track, className }: { track: Track; className?: string }) {
  return (
    <span className={cn('truncate', className)}>
      {track.artists.map((a, i) => (
        <span key={`${a.name}-${i}`}>
          {i > 0 && ', '}
          {a.id ? <Link to={`/artist/${a.id}`} className="hover:text-text hover:underline" onClick={(e) => e.stopPropagation()}>{a.name}</Link> : a.name}
        </span>
      ))}
    </span>
  );
}

interface Props {
  tracks: Track[];
  /** Number rows instead of showing artwork (album pages). */
  numbered?: boolean;
  showAlbum?: boolean;
  onRemove?: (track: Track) => void;
}

export function TrackList({ tracks, numbered, showAlbum, onRemove }: Props) {
  const current = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  const playList = usePlayer((s) => s.playList);

  return (
    <ol className="flex flex-col" aria-label="Songs">
      {tracks.map((t, i) => {
        const active = current?.id === t.id;
        return (
          <ContextMenu key={`${t.id}-${i}`}>
            <ContextMenuTrigger asChild>
              <li
                className={cn(
                  'group grid h-14 cursor-default grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 hover:bg-accent',
                  showAlbum && 'lg:grid-cols-[2.5rem_minmax(0,3fr)_minmax(0,2fr)_auto]',
                  active && 'bg-accent',
                )}
                onDoubleClick={() => playList(tracks, i)}
              >
                <button
                  className="relative grid size-10 place-items-center"
                  onClick={() => playList(tracks, i)}
                  aria-label={`Play ${t.title}`}
                >
                  {numbered ? (
                    <span className={cn('font-display text-sm tabular-nums text-text-faint group-hover:opacity-0', active && 'text-seed')}>{i + 1}</span>
                  ) : (
                    <Artwork src={t.thumbnail} className="size-10 rounded-lg" />
                  )}
                  <span className={cn('absolute inset-0 grid place-items-center rounded-lg opacity-0 group-hover:opacity-100', !numbered && 'bg-black/50')}>
                    <Play className="size-4 fill-current" />
                  </span>
                  {active && playing && (
                    <span className={cn('absolute inset-0 grid place-items-center rounded-lg group-hover:opacity-0', !numbered && 'bg-black/50')}>
                      <AudioLines className="size-4 text-seed-soft" />
                    </span>
                  )}
                </button>
                <div className="min-w-0">
                  <div className={cn('truncate text-[15px] font-medium', active && 'text-seed-soft')}>{t.title}</div>
                  <ArtistLinks track={t} className="block text-sm text-text-muted" />
                </div>
                {showAlbum && (
                  <div className="hidden min-w-0 truncate text-sm text-text-muted lg:block">
                    {t.album?.id ? <Link to={`/album/${t.album.id}`} className="hover:text-text hover:underline">{t.album.name}</Link> : t.album?.name}
                  </div>
                )}
                <RowEnd track={t} onRemove={onRemove && (() => onRemove(t))} />
              </li>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-60">
              <TrackMenuItems track={t} kind="context" onRemove={onRemove && (() => onRemove(t))} />
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </ol>
  );
}

function RowEnd({ track, onRemove }: { track: Track; onRemove?: () => void }) {
  const liked = useIsLiked(track.id);
  return (
    <div className="flex items-center gap-1">
      {liked && <Heart className="size-4 fill-seed text-seed" aria-label="Liked" />}
      <span className="w-12 text-right text-sm tabular-nums text-text-faint">{track.duration ? formatTime(track.duration) : ''}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid size-9 place-items-center rounded-full text-text-muted opacity-0 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100"
          aria-label={`More options for ${track.title}`}
        >
          <MoreHorizontal className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <TrackMenuItems track={track} kind="dropdown" onRemove={onRemove} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
