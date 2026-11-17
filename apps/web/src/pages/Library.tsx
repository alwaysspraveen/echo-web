import { Link } from 'react-router';
import { Heart, History, ListMusic, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, useHistory, useLiked, usePlaylists } from '@/lib/db';
import { TrackList } from '@/components/TrackList';
import { CollectionHeader } from '@/components/Page';
import { Artwork } from '@/components/Artwork';
import { openNewPlaylist } from '@/components/NewPlaylistDialog';
import { formatBytes, removeOffline, useOfflineTracks } from '@/lib/offline';

export function LibraryPage() {
  const liked = useLiked();
  const history = useHistory();
  const playlists = usePlaylists();
  const tile = 'group flex flex-col rounded-[24px] bg-glass p-4 hover:bg-surface-high';
  return (
    <div>
      <div className="mb-6 flex items-center justify-between px-2.5">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Library</h1>
        <Button variant="secondary" onClick={() => openNewPlaylist()}><Plus />New playlist</Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4 px-2.5">
        <Link to="/library/liked" className={`${tile} bg-gradient-to-br from-seed/70 to-seed/20`}>
          <Heart className="size-8 fill-white" />
          <span className="mt-auto pt-10 font-display text-2xl font-bold">Liked songs</span>
          <span className="text-sm text-text-muted">{liked.length} song{liked.length === 1 ? '' : 's'}</span>
        </Link>
        <Link to="/library/history" className={tile}>
          <History className="size-8" />
          <span className="mt-auto pt-10 font-display text-2xl font-bold">Recently played</span>
          <span className="text-sm text-text-muted">{history.length} song{history.length === 1 ? '' : 's'}</span>
        </Link>
        {playlists.map((p) => (
          <Link key={p.id} to={`/library/playlist/${p.id}`} className={tile}>
            {p.tracks[0]?.thumbnail ? <Artwork src={p.tracks[0].thumbnail} className="size-14 rounded-xl" /> : <ListMusic className="size-8" />}
            <span className="mt-auto truncate pt-6 font-display text-2xl font-bold">{p.name}</span>
            <span className="text-sm text-text-muted">{p.tracks.length} song{p.tracks.length === 1 ? '' : 's'}</span>
          </Link>
        ))}
      </div>
      <p className="mt-10 px-2.5 text-sm text-text-faint">Your library is saved in this browser only.</p>
    </div>
  );
}

export function LikedPage() {
  const liked = useLiked();
  return (
    <>
      <CollectionHeader kind="Playlist" title="Liked songs" tracks={liked} thumbnail={liked[0]?.thumbnail} subtitle={`${liked.length} song${liked.length === 1 ? '' : 's'}`} />
      {liked.length ? <TrackList tracks={liked} showAlbum /> : <p className="px-2 text-text-muted">Songs you like show up here. Click the heart in the player, or press L while a song plays.</p>}
    </>
  );
}

export function HistoryPage() {
  const history = useHistory();
  return (
    <>
      <CollectionHeader
        kind="History"
        title="Recently played"
        tracks={history}
        thumbnail={history[0]?.thumbnail}
        subtitle={`${history.length} song${history.length === 1 ? '' : 's'}`}
        actions={history.length > 0 && <Button size="lg" variant="ghost" onClick={() => window.confirm('Clear your listening history?') && db.history.clear()}>Clear history</Button>}
      />
      {history.length ? <TrackList tracks={history} showAlbum /> : <p className="px-2 text-text-muted">Songs you play show up here.</p>}
    </>
  );
}

export function DownloadsPage() {
  const rows = useOfflineTracks();
  const tracks = rows.map((r) => r.track);
  const total = rows.reduce((n, r) => n + r.size, 0);
  return (
    <>
      <CollectionHeader
        downloadable={false}
        kind="Offline"
        title="Downloads"
        tracks={tracks}
        thumbnail={tracks[0]?.thumbnail}
        subtitle={`${tracks.length} song${tracks.length === 1 ? '' : 's'} · ${formatBytes(total)} · plays without internet`}
      />
      {tracks.length ? (
        <TrackList tracks={tracks} showAlbum onRemove={(t) => removeOffline(t)} removeLabel="Remove offline download" />
      ) : (
        <p className="px-2 text-text-muted">Songs you save for offline show up here. Hover the download button in the player and choose "Save for offline", or use Download on an album or playlist.</p>
      )}
    </>
  );
}
