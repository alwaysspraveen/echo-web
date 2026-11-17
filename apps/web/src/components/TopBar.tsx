import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSuggestions } from '@/lib/api';
import { cn } from '@/lib/utils';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQ = location.pathname === '/search' ? params.get('q') ?? '' : '';
  const [q, setQ] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const debounced = useDebounced(q.trim(), 200);
  const { data: suggestions = [] } = useSuggestions(open ? debounced : '');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setQ(urlQ); }, [urlQ]);
  useEffect(() => { setHi(-1); }, [debounced]);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    setQ(t);
    setOpen(false);
    input.current?.blur();
    navigate(`/search?q=${encodeURIComponent(t)}`);
  };

  const showList = open && suggestions.length > 0 && q.trim().length > 1;

  return (
    <header className="flex items-center gap-3 px-6 py-4">
      <Button variant="secondary" size="icon" onClick={() => navigate(-1)} aria-label="Go back"><ChevronLeft className="size-5" /></Button>
      <Button variant="secondary" size="icon" onClick={() => navigate(1)} aria-label="Go forward"><ChevronRight className="size-5" /></Button>
      <form
        role="search"
        className="relative w-full max-w-lg"
        onSubmit={(e) => { e.preventDefault(); go(hi >= 0 ? suggestions[hi] : q); }}
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
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, suggestions.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
            else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
          }}
          placeholder="Search songs, albums, artists"
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls="search-suggestions"
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
          <ul id="search-suggestions" role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[20px] bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl">
            {suggestions.map((s, i) => (
              <li key={s} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(s)}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] hover:bg-accent', i === hi && 'bg-accent')}
                >
                  <Search className="size-4 text-text-faint" aria-hidden />{s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    </header>
  );
}
