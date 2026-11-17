import { useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearch } from '@/lib/api';
import { CardGrid, MediaCard } from '@/components/Cards';
import { TrackList } from '@/components/TrackList';
import { ErrorState, ShelvesSkeleton } from '@/components/Page';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const { data, isLoading, error, refetch } = useSearch(q);

  if (!q)
    return (
      <div className="px-2.5 pt-16">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Search</h1>
        <p className="mt-3 max-w-md text-text-muted">Find any song, album, artist or playlist on YouTube Music. Press <kbd className="rounded-md bg-glass px-1.5 py-0.5 text-sm">/</kbd> to jump to the search box.</p>
      </div>
    );
  if (isLoading) return <ShelvesSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (!data) return null;

  const empty = !data.songs.length && !data.albums.length && !data.artists.length && !data.playlists.length;
  if (empty) return <p className="px-2.5 pt-16 text-lg text-text-muted">Nothing found for "{q}". Try a different spelling or fewer words.</p>;

  const top = data.artists[0];
  return (
    <Tabs defaultValue="all" key={q}>
      <TabsList className="mb-6 ml-2.5 bg-glass">
        <TabsTrigger value="all" className="px-4">All</TabsTrigger>
        <TabsTrigger value="songs" className="px-4" disabled={!data.songs.length}>Songs</TabsTrigger>
        <TabsTrigger value="albums" className="px-4" disabled={!data.albums.length}>Albums</TabsTrigger>
        <TabsTrigger value="artists" className="px-4" disabled={!data.artists.length}>Artists</TabsTrigger>
        <TabsTrigger value="playlists" className="px-4" disabled={!data.playlists.length}>Playlists</TabsTrigger>
      </TabsList>

      <TabsContent value="all">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {top && (
            <section>
              <h2 className="mb-2 px-2.5 font-display text-2xl font-bold">Top result</h2>
              <MediaCard card={top} className="w-64" />
            </section>
          )}
          <section className="min-w-0">
            <h2 className="mb-2 px-2.5 font-display text-2xl font-bold">Songs</h2>
            <TrackList tracks={data.songs.slice(0, 5)} />
          </section>
        </div>
        {data.albums.length > 0 && <Block title="Albums"><CardGrid cards={data.albums.slice(0, 6)} /></Block>}
        {data.artists.length > 1 && <Block title="Artists"><CardGrid cards={data.artists.slice(1, 7)} /></Block>}
        {data.playlists.length > 0 && <Block title="Playlists"><CardGrid cards={data.playlists.slice(0, 6)} /></Block>}
      </TabsContent>
      <TabsContent value="songs"><TrackList tracks={data.songs} showAlbum /></TabsContent>
      <TabsContent value="albums"><CardGrid cards={data.albums} /></TabsContent>
      <TabsContent value="artists"><CardGrid cards={data.artists} /></TabsContent>
      <TabsContent value="playlists"><CardGrid cards={data.playlists} /></TabsContent>
    </Tabs>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-2 px-2.5 font-display text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
