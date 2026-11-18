import { useHome } from '@/lib/api';
import { useHistory } from '@/lib/db';
import { ShelfRow } from '@/components/Cards';
import { ErrorState, ShelvesSkeleton } from '@/components/Page';
import type { Shelf } from '@resona/shared';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night listening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomePage() {
  const { data, isLoading, error, refetch } = useHome();
  const history = useHistory();
  const recent: Shelf | null = history.length
    ? {
        title: 'Listen again',
        items: history.slice(0, 20).map((t) => ({ kind: 'song', id: t.id, title: t.title, subtitle: t.artists.map((a) => a.name).join(', '), thumbnail: t.thumbnail, track: t })),
      }
    : null;

  return (
    <div>
      <h1 className="mb-6 px-2.5 font-display text-5xl font-extrabold tracking-tight">{greeting()}</h1>
      {recent && <ShelfRow shelf={recent} />}
      {isLoading && <ShelvesSkeleton />}
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
      {data?.map((s, i) => <ShelfRow key={`${s.title}-${i}`} shelf={s} />)}
    </div>
  );
}
