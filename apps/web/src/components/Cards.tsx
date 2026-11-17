import { useRef } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { Card, Shelf } from '@echo/shared';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';
import { TrackMenuItems } from './TrackMenu';

const hrefOf = (c: Card) =>
  c.kind === 'album' ? `/album/${c.id}` : c.kind === 'artist' ? `/artist/${c.id}` : c.kind === 'playlist' ? `/playlist/${c.id}` : undefined;

export function MediaCard({ card, className }: { card: Card; className?: string }) {
  const playList = usePlayer((s) => s.playList);
  const href = hrefOf(card);
  const round = card.kind === 'artist';
  const wide = card.kind === 'video';

  const body = (
    <>
      <div className="relative">
        <Artwork src={card.thumbnail} alt="" round={round} className={cn('w-full', wide ? 'aspect-video' : 'aspect-square', !round && 'rounded-2xl')} />
        {card.track && (
          <span className="absolute right-2 bottom-2 grid size-10 place-items-center rounded-full bg-seed text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Play className="size-4 translate-x-px fill-current" />
          </span>
        )}
      </div>
      <div className={cn('mt-2.5 px-0.5', round && 'text-center')}>
        <div className="line-clamp-2 text-[15px] leading-snug font-medium">{card.title}</div>
        {card.subtitle && <div className="mt-0.5 truncate text-sm text-text-muted">{card.subtitle}</div>}
      </div>
    </>
  );

  const cls = cn('group block rounded-[24px] p-2.5 text-left outline-none hover:bg-glass focus-visible:bg-glass', className);

  if (card.track) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button className={cls} onClick={() => playList([card.track!])} aria-label={`Play ${card.title}`}>{body}</button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60"><TrackMenuItems track={card.track} kind="context" /></ContextMenuContent>
      </ContextMenu>
    );
  }
  return href ? <Link to={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** One horizontally scrolling row of cards with arrow buttons. */
export function ShelfRow({ shelf }: { shelf: Shelf }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  const hasVideo = shelf.items.some((i) => i.kind === 'video');
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-end justify-between gap-4 px-2.5">
        <h2 className="font-display text-2xl font-bold tracking-tight">{shelf.title}</h2>
        <div className="flex gap-1">
          <button onClick={() => scroll(-1)} className="grid size-8 place-items-center rounded-full bg-glass hover:bg-surface-high" aria-label={`Scroll ${shelf.title} left`}>
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => scroll(1)} className="grid size-8 place-items-center rounded-full bg-glass hover:bg-surface-high" aria-label={`Scroll ${shelf.title} right`}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar flex snap-x snap-mandatory scroll-px-0 overflow-x-auto">
        {shelf.items.map((c, i) => (
          <MediaCard key={`${c.id}-${i}`} card={c} className={cn('shrink-0 snap-start', hasVideo && c.kind === 'video' ? 'w-72' : 'w-44 xl:w-48')} />
        ))}
      </div>
    </section>
  );
}

export function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
      {cards.map((c, i) => <MediaCard key={`${c.id}-${i}`} card={c} />)}
    </div>
  );
}
