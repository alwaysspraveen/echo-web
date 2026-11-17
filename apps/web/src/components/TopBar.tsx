import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowUpRight, ChevronLeft, ChevronRight, Play, Search, X } from 'lucide-react';
import type { Card } from '@echo/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSuggestions } from '@/lib/api';
import { usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const KIND_LABEL: Record<Card['kind'], string> = { song: 'Song', video: 'Video', album: 'Album', playlist: 'Playlist', artist: 'Artist' };

/** "Song · Coldplay", "Artist", "Playlist" … like Spotify's suggestion rows. */
function describe(card: Card) {
  const label = KIND_LABEL[card.kind];
  const sub = card.kind === 'artist' ? '' : card.subtitle?.replace(new RegExp(`^${label}\\s*[•·]\\s*`, 'i'), '');
  return sub ? `${label} · ${sub}` : label;
}

type Option = { type: 'item'; card: Card } | { type: 'query'; text: string };

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQ = location.pathname === '/search' ? params.get('q') ?? '' : '';
  const [q, setQ] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const debounced = useDebounced(q.trim(), 180);
  const { data } = useSuggestions(open ? debounced : '');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setQ(urlQ); }, [urlQ]);
  useEffect(() => { setHi(-1); }, [debounced]);

  const items = data?.items ?? [];
  const queries = data?.queries ?? [];
  const options: Option[] = [...items.map((card) => ({ type: 'item' as const, card })), ...queries.map((text) => ({ type: 'query' as const, text }))];
  const showList = open && options.length > 0 && q.trim().length > 1;

  const close = () => { setOpen(false); input.current?.blur(); };

  const search = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setQ(t);
    close();
    navigate(`/search?q=${encodeURIComponent(t)}`);
  };

  const activate = (o: Option) => {
    if (o.type === 'query') return search(o.text);
    const c = o.card;
    close();
    if (c.track) usePlayer.getState().playList([c.track]);
    else navigate(c.kind === 'artist' ? `/artist/${c.id}` : c.kind === 'album' ? `/album/${c.id}` : `/playlist/${c.id}`);
  };

  return (
    <header className="drag-area flex items-center gap-3 px-6 py-4">
      <Button variant="secondary" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ChevronLeft className="size-5" /></Button>
      <Button variant="secondary" size="icon" onClick={() => navigate(1)} aria-label="Go forward"><ChevronRight className="size-5" /></Button>
      <form
        role="search"
        className="relative w-full max-w-lg"
        onSubmit={(e) => { e.preventDefault(); if (hi >= 0 && options[hi]) activate(options[hi]); else search(q); }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-text-faint" aria-hidden />
        <Input
          id="search-input"
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
            else if (e.key === 'Escape') close();
          }}
          placeholder="What do you want to play?"
          aria-label="Search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls="search-suggestions"
          aria-activedescendant={hi >= 0 ? `suggestion-${hi}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className="rounded-full pr-10 pl-11"
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); input.current?.focus(); }} className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-text-faint hover:text-text" aria-label="Clear search">
            <X className="size-4" />
          </button>
        )}
        {showList && (
          <div
            id="search-suggestions"
            role="listbox"
            aria-label="Suggestions"
            className="scrollbar-thin absolute inset-x-0 top-[calc(100%+8px)] z-30 max-h-[70vh] overflow-y-auto rounded-[22px] bg-popover/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {options.map((o, i) =>
              o.type === 'item' ? (
                <button
                  key={`i-${o.card.kind}-${o.card.id}`}
                  id={`suggestion-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === hi}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => activate(o)}
                  className={cn('group flex w-full items-center gap-3 rounded-2xl p-2 text-left', i === hi && 'bg-accent')}
                >
                  <span className="relative shrink-0">
                    <Artwork src={o.card.thumbnail} round={o.card.kind === 'artist'} className={cn('size-12', o.card.kind !== 'artist' && 'rounded-lg')} />
                    {o.card.track && (
                      <span className={cn('absolute inset-0 grid place-items-center rounded-lg bg-black/50 opacity-0', i === hi && 'opacity-100')}>
                        <Play className="size-4 fill-white text-white" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{o.card.title}</span>
                    <span className="block truncate text-sm text-text-muted">{describe(o.card)}</span>
                  </span>
                </button>
              ) : (
                <button
                  key={`q-${o.text}`}
                  id={`suggestion-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === hi}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => activate(o)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px]',
                    i === hi && 'bg-accent',
                    i === items.length && items.length > 0 && 'mt-1',
                  )}
                >
                  <Search className="size-4 shrink-0 text-text-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{o.text}</span>
                  <ArrowUpRight className={cn('size-4 text-text-faint opacity-0', i === hi && 'opacity-100')} aria-hidden />
                </button>
              ),
            )}
          </div>
        )}
      </form>
    </header>
  );
}
