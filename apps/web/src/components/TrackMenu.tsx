import type { ComponentType, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Disc3, Download, FileAudio, HardDriveDownload, Heart, HeartOff, ListEnd, ListPlus, ListStart, Plus, Radio, Trash2, UserRound } from 'lucide-react';
import type { Track } from '@echo/shared';
import {
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { addToPlaylist, toggleLike, useIsLiked, usePlaylists } from '@/lib/db';
import { fetchRadio } from '@/lib/api';
import { downloadTrack } from '@/lib/download';
import { removeOffline, saveOffline, useDownloadProgress, useIsOffline } from '@/lib/offline';
import { usePlayer } from '@/player/store';
import { openNewPlaylist } from './NewPlaylistDialog';

interface MenuParts {
  Item: ComponentType<{ onSelect?: (e: Event) => void; children: ReactNode; variant?: 'default' | 'destructive' }>;
  Separator: ComponentType;
  Sub: ComponentType<{ children: ReactNode }>;
  SubTrigger: ComponentType<{ children: ReactNode }>;
  SubContent: ComponentType<{ children: ReactNode; className?: string }>;
}

const contextParts: MenuParts = {
  Item: ContextMenuItem, Separator: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent,
};
const dropdownParts: MenuParts = {
  Item: DropdownMenuItem, Separator: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent,
};

export async function startRadio(track: Track) {
  const { playList } = usePlayer.getState();
  playList([track]);
  try {
    const tracks = await fetchRadio(track.id);
    usePlayer.getState().appendRadio(track.id, tracks);
    toast(`Radio started from "${track.title}"`);
  } catch {
    toast.error("Couldn't load radio for this song.");
  }
}

export interface TrackMenuProps {
  track: Track;
  kind: 'context' | 'dropdown';
  /** Shown when the row lives in a local playlist (or the Downloads page). */
  onRemove?: () => void;
  removeLabel?: string;
}

export function TrackMenuItems({ track, kind, onRemove, removeLabel = 'Remove from this playlist' }: TrackMenuProps) {
  const M = kind === 'context' ? contextParts : dropdownParts;
  const navigate = useNavigate();
  const liked = useIsLiked(track.id);
  const offline = useIsOffline(track.id);
  const progress = useDownloadProgress(track.id);
  const playlists = usePlaylists();
  const artist = track.artists.find((a) => a.id);

  const add = async (id: string, name: string) => {
    const n = await addToPlaylist(id, [track]);
    toast(n ? `Added to ${name}` : `Already in ${name}`);
  };

  return (
    <>
      <M.Item onSelect={() => { usePlayer.getState().playNext(track); toast('Plays next'); }}><ListStart />Play next</M.Item>
      <M.Item onSelect={() => { usePlayer.getState().addToQueue([track]); toast('Added to queue'); }}><ListEnd />Add to queue</M.Item>
      <M.Item onSelect={() => startRadio(track)}><Radio />Start radio</M.Item>
      <M.Separator />
      <M.Item onSelect={() => toggleLike(track).then((l) => toast(l ? 'Added to Liked songs' : 'Removed from Liked songs'))}>
        {liked ? <><HeartOff />Remove from Liked songs</> : <><Heart />Add to Liked songs</>}
      </M.Item>
      <M.Sub>
        <M.SubTrigger><ListPlus />Add to playlist</M.SubTrigger>
        <M.SubContent className="max-h-80 overflow-y-auto">
          <M.Item onSelect={() => openNewPlaylist([track])}><Plus />New playlist…</M.Item>
          {playlists.length > 0 && <M.Separator />}
          {playlists.map((p) => <M.Item key={p.id} onSelect={() => add(p.id, p.name)}>{p.name}</M.Item>)}
        </M.SubContent>
      </M.Sub>
      <M.Sub>
        <M.SubTrigger><Download />Download</M.SubTrigger>
        <M.SubContent className="w-60">
          {progress !== undefined ? (
            <M.Item onSelect={() => {}}><HardDriveDownload />Downloading… {Math.round(progress * 100)}%</M.Item>
          ) : offline ? (
            <M.Item variant="destructive" onSelect={() => removeOffline(track)}><Trash2 />Remove offline download</M.Item>
          ) : (
            <M.Item onSelect={() => saveOffline(track)}><HardDriveDownload />Save for offline</M.Item>
          )}
          <M.Item onSelect={() => downloadTrack(track)}><FileAudio />Download file (MP3)</M.Item>
        </M.SubContent>
      </M.Sub>
      {onRemove && <M.Item variant="destructive" onSelect={onRemove}><Trash2 />{removeLabel}</M.Item>}
      {(artist || track.album?.id) && <M.Separator />}
      {artist?.id && <M.Item onSelect={() => navigate(`/artist/${artist.id}`)}><UserRound />Go to artist</M.Item>}
      {track.album?.id && <M.Item onSelect={() => navigate(`/album/${track.album!.id}`)}><Disc3 />Go to album</M.Item>}
    </>
  );
}
