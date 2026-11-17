import { Link, useNavigate, useParams } from 'react-router';
import { Play, Radio, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAlbum, useArtist, usePlaylist } from '@/lib/api';
import { deletePlaylist, removeFromPlaylist, renamePlaylist, useLocalPlaylist } from '@/lib/db';
import { usePlayer } from '@/player/store';
import { ShelfRow } from '@/components/Cards';
import { TrackList } from '@/components/TrackList';
import { CollectionHeader, CollectionSkeleton, ErrorState } from '@/components/Page';
import { startRadio } from '@/components/TrackMenu';

export function AlbumPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useAlbum(id);
  if (isLoading) return <CollectionSkeleton />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Album not found'} onRetry={() => refetch()} />;
  return (
    <>
      <CollectionHeader
        kind="Album"
        title={data.title}
        thumbnail={data.thumbnail}
        tracks={data.tracks}
        subtitle={
          <>
            {data.artist?.id ? <Link to={`/artist/${data.artist.id}`} className="font-semibold text-text hover:underline">{data.artist.name}</Link> : data.artist?.name}
            {data.subtitle && <span> · {data.subtitle}</span>}
          </>
        }
      />
      <TrackList tracks={data.tracks} numbered />
    </>
  );
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = usePlaylist(id);
  if (isLoading) return <CollectionSkeleton />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Playlist not found'} onRetry={() => refetch()} />;
  return (
    <>
      <CollectionHeader kind="Playlist" title={data.title} thumbnail={data.thumbnail} tracks={data.tracks} subtitle={data.subtitle} />
      <TrackList tracks={data.tracks} showAlbum />
    </>
  );
}

export function ArtistPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useArtist(id);
  const playList = usePlayer((s) => s.playList);
  if (isLoading) return <CollectionSkeleton />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Artist not found'} onRetry={() => refetch()} />;
  return (
    <>
      <div className="relative -mx-6 -mt-[72px] mb-8 h-[360px] overflow-hidden">
        {data.thumbnail && <img src={data.thumbnail} alt="" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover object-[center_25%]" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-8 pb-6">
          <h1 className="font-display text-7xl font-extrabold tracking-tight">{data.name}</h1>
          <div className="mt-5 flex gap-2">
            <Button size="lg" onClick={() => playList(data.topSongs)} disabled={!data.topSongs.length}><Play className="fill-current" />Play</Button>
            {data.topSongs[0] && <Button size="lg" variant="secondary" onClick={() => startRadio(data.topSongs[0])}><Radio />Radio</Button>}
          </div>
        </div>
      </div>
      {data.topSongs.length > 0 && (
        <section className="mb-10 max-w-4xl">
          <h2 className="mb-2 px-2.5 font-display text-2xl font-bold">Popular</h2>
          <TrackList tracks={data.topSongs} showAlbum />
        </section>
      )}
      {data.shelves.map((s, i) => <ShelfRow key={`${s.title}-${i}`} shelf={s} />)}
      {data.description && (
        <section className="mb-10 max-w-3xl px-2.5">
          <h2 className="mb-2 font-display text-2xl font-bold">About</h2>
          <p className="line-clamp-6 leading-relaxed text-text-muted">{data.description}</p>
        </section>
      )}
    </>
  );
}

export function LocalPlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const playlist = useLocalPlaylist(id);
  if (playlist === undefined) return <CollectionSkeleton />;
  if (!playlist) return <ErrorState message="This playlist was deleted" />;

  const rename = () => {
    const name = window.prompt('Rename playlist', playlist.name);
    if (name != null) renamePlaylist(id, name);
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${playlist.name}"? This can't be undone.`)) return;
    await deletePlaylist(id);
    toast(`Deleted "${playlist.name}"`);
    navigate('/library');
  };

  return (
    <>
      <CollectionHeader
        kind="Your playlist"
        title={playlist.name}
        thumbnail={playlist.tracks[0]?.thumbnail}
        tracks={playlist.tracks}
        subtitle={`${playlist.tracks.length} song${playlist.tracks.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button size="lg" variant="ghost" onClick={rename}>Rename</Button>
            <Button size="lg" variant="ghost" onClick={remove} className="text-destructive"><Trash2 />Delete</Button>
          </>
        }
      />
      {playlist.tracks.length ? (
        <TrackList tracks={playlist.tracks} showAlbum onRemove={(t) => removeFromPlaylist(id, t.id)} />
      ) : (
        <p className="px-2 text-text-muted">This playlist is empty. Right-click any song and choose "Add to playlist".</p>
      )}
    </>
  );
}

