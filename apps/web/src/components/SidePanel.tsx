import { X } from 'lucide-react';
import { useCurrentTrack, usePlayer, useUi } from '@/player/store';
import { cn } from '@/lib/utils';
import { Artwork } from './Artwork';
import { LyricsView } from './LyricsView';
import { ListenTogetherPanel } from './ListenTogether';
import { useLt } from '@/lib/listenTogether';
import { useBrainAdded } from '@/lib/brain';

function Queue() {
  const { queue, index, jumpTo, remove, clear } = usePlayer();
  if (index === -1) return <p className="px-5 py-6 text-sm text-text-muted">Your queue is empty. Play a song or add one with "Add to queue".</p>;
  const upNext = queue.slice(index + 1);
  const current = queue[index];
  return (
    <div className="px-3 pb-6">
      <h3 className="px-2 pt-2 pb-1 text-sm font-semibold text-text-muted">Now playing</h3>
      <QueueRow track={current} active onPlay={() => {}} />
      <div className="flex items-center justify-between px-2 pt-5 pb-1">
        <h3 className="text-sm font-semibold text-text-muted">Next up {upNext.length > 0 && <span className="text-text-faint">· {upNext.length}</span>}</h3>
        <button onClick={clear} className="rounded-full px-2.5 py-1 text-xs text-text-muted hover:bg-accent hover:text-text">Clear queue</button>
      </div>
      {upNext.length === 0 && <p className="px-2 py-2 text-sm text-text-faint">Similar songs will be added when this one is playing.</p>}
      {upNext.map((t, i) => (
        <QueueRow key={`${t.id}-${i}`} track={t} onPlay={() => jumpTo(index + 1 + i)} onRemove={() => remove(index + 1 + i)} />
      ))}
    </div>
  );
}

function QueueRow({ track, active, onPlay, onRemove }: { track: ReturnType<typeof useCurrentTrack> & object; active?: boolean; onPlay: () => void; onRemove?: () => void }) {
  return (
    <div className={cn('group flex items-center gap-3 rounded-xl p-2 hover:bg-accent', active && 'bg-accent')}>
      <button onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Play ${track.title}`}>
        <Artwork src={track.thumbnail} className="size-11 rounded-lg" />
        <span className="min-w-0">
          <span className={cn('block truncate text-sm font-medium', active && 'text-seed-soft')}>{track.title}</span>
          <span className="block truncate text-xs text-text-muted">
            {useBrainAdded.getState().ids.has(track.id) && (
              <span className="mr-1.5 rounded bg-seed/20 px-1 text-[10px] font-bold text-seed-soft" title="This song was dynamically added by Resona Brain based on your listening patterns, the current song's genre, and your library's vibes.">ECHO BRAIN</span>
            )}
            {track.artists.map((a) => a.name).join(', ')}
          </span>
        </span>
      </button>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${track.title} from queue`} className="grid size-8 place-items-center rounded-full text-text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-high hover:text-text focus-visible:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function SidePanel() {
  const { panel, setPanel } = useUi();
  const track = useCurrentTrack();
  const inJam = useLt((s) => !!s.session);
  if (!panel) return null;
  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-[24px] bg-glass xl:w-[380px]" aria-label={panel === 'queue' ? 'Queue' : panel === 'jam' ? 'Listen Together' : 'Lyrics'}>
      <div className="flex items-center gap-1 p-2">
        {(inJam ? (['queue', 'lyrics', 'jam'] as const) : (['queue', 'lyrics'] as const)).map((p) => (
          <button
            key={p}
            onClick={() => setPanel(p)}
            aria-pressed={panel === p}
            className={cn('h-9 rounded-full px-4 text-sm font-semibold capitalize', panel === p ? 'bg-text text-bg' : 'text-text-muted hover:bg-accent hover:text-text')}
          >
            {p === 'jam' ? 'Together' : p}
          </button>
        ))}
        <button onClick={() => setPanel(null)} className="ml-auto grid size-9 place-items-center rounded-full text-text-muted hover:bg-accent hover:text-text" aria-label="Close panel">
          <X className="size-4" />
        </button>
      </div>
      <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto', panel === 'lyrics' && '[mask-image:linear-gradient(transparent,black_12%,black_88%,transparent)]')}>
        {panel === 'queue' ? <Queue /> : panel === 'jam' ? <ListenTogetherPanel /> : <LyricsView track={track} />}
      </div>
    </aside>
  );
}
