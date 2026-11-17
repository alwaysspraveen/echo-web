import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { Shelf } from '@echo/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShelfRow } from '@/components/Cards';
import { ErrorState, ShelvesSkeleton } from '@/components/Page';

interface MoodGroup { title: string; items: { title: string; params: string; color?: string }[] }

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  return res.json();
}
const useShelves = (key: string, path: string, enabled = true) =>
  useQuery({ queryKey: [key], queryFn: ({ signal }) => get<Shelf[]>(path, signal), staleTime: 30 * 60_000, enabled });

function Shelves({ query }: { query: ReturnType<typeof useShelves> }) {
  if (query.isLoading) return <ShelvesSkeleton />;
  if (query.error) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  return <>{query.data?.map((s, i) => <ShelfRow key={`${s.title}-${i}`} shelf={s} />)}</>;
}

function Moods() {
  const q = useQuery({ queryKey: ['moods'], queryFn: ({ signal }) => get<MoodGroup[]>('/moods', signal), staleTime: 6 * 60 * 60_000 });
  if (q.isLoading) return <ShelvesSkeleton />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  return (
    <>
      {q.data?.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="mb-3 px-2.5 font-display text-2xl font-bold">{g.title}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5 px-2.5">
            {g.items.map((m) => (
              <Link
                key={m.params}
                to={`/explore/mood/${encodeURIComponent(m.params)}?title=${encodeURIComponent(m.title)}`}
                className="flex h-14 items-center rounded-xl border-l-4 bg-glass px-4 font-semibold hover:bg-surface-high"
                style={{ borderLeftColor: m.color ?? 'var(--seed)' }}
              >
                {m.title}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'charts';
  const charts = useShelves('charts', '/charts', tab === 'charts');
  const podcasts = useShelves('podcasts', '/podcasts', tab === 'podcasts');
  return (
    <div>
      <h1 className="mb-5 px-2.5 font-display text-5xl font-extrabold tracking-tight">Explore</h1>
      <Tabs value={tab} onValueChange={(t) => setParams({ tab: t }, { replace: true })}>
        <TabsList className="mb-6 ml-2.5 bg-glass">
          <TabsTrigger value="charts" className="px-4">Charts</TabsTrigger>
          <TabsTrigger value="moods" className="px-4">Moods &amp; genres</TabsTrigger>
          <TabsTrigger value="podcasts" className="px-4">Podcasts</TabsTrigger>
        </TabsList>
        <TabsContent value="charts"><Shelves query={charts} /></TabsContent>
        <TabsContent value="moods"><Moods /></TabsContent>
        <TabsContent value="podcasts"><Shelves query={podcasts} /></TabsContent>
      </Tabs>
    </div>
  );
}

export function MoodPage() {
  const { params = '' } = useParams();
  const [search] = useSearchParams();
  const q = useShelves(`mood:${params}`, `/moods/${encodeURIComponent(params)}`);
  return (
    <div>
      <h1 className="mb-6 px-2.5 font-display text-5xl font-extrabold tracking-tight">{search.get('title') ?? 'Mood'}</h1>
      <Shelves query={q} />
    </div>
  );
}
