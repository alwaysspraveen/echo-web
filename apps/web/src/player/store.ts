import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@echo/shared';
import { insertNext, moveItem, nextIndex, prevIndex, removeAt, shuffleFrom, type RepeatMode } from '@/lib/queue';

interface PlayerState {
  queue: Track[];
  index: number; // -1 when nothing is loaded
  unshuffled: Track[] | null; // original order while shuffle is on
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number; // 0..1
  muted: boolean;
  playing: boolean;
  /** true once the queue came from "radio" so we don't keep refetching for the same seed */
  radioFor: string | null;

  playList: (tracks: Track[], start?: number) => void;
  playNext: (track: Track) => void;
  addToQueue: (tracks: Track[]) => void;
  appendRadio: (seedId: string, tracks: Track[]) => void;
  jumpTo: (i: number) => void;
  remove: (i: number) => void;
  move: (from: number, to: number) => void;
  /** Returns false when the queue ended (caller may fetch radio). */
  next: (auto?: boolean) => boolean;
  prev: (currentTime: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlaying: (p: boolean) => void;
  togglePlay: () => void;
  clear: () => void;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: -1,
      unshuffled: null,
      shuffle: false,
      repeat: 'off',
      volume: 0.8,
      muted: false,
      playing: false,
      radioFor: null,

      playList: (tracks, start = 0) => {
        if (!tracks.length) return;
        const { shuffle } = get();
        set(
          shuffle
            ? { queue: shuffleFrom(tracks, start), index: 0, unshuffled: tracks, playing: true, radioFor: null }
            : { queue: tracks, index: start, unshuffled: null, playing: true, radioFor: null },
        );
      },
      playNext: (track) => {
        const { queue, index } = get();
        if (index === -1) return get().playList([track]);
        set(insertNext(queue, index, track));
      },
      addToQueue: (tracks) => {
        const { queue, index } = get();
        if (index === -1) return get().playList(tracks);
        const have = new Set(queue.map((t) => t.id));
        set({ queue: [...queue, ...tracks.filter((t) => !have.has(t.id))] });
      },
      appendRadio: (seedId, tracks) => {
        const have = new Set(get().queue.map((t) => t.id));
        set({ queue: [...get().queue, ...tracks.filter((t) => !have.has(t.id))], radioFor: seedId });
      },
      jumpTo: (i) => set({ index: i, playing: true }),
      remove: (i) => {
        const { queue, index } = get();
        if (queue.length === 1) return get().clear();
        set(removeAt(queue, index, i));
      },
      move: (from, to) => {
        const { queue, index } = get();
        set(moveItem(queue, index, from, to));
      },
      next: (auto = false) => {
        const { queue, index, repeat } = get();
        const n = nextIndex(queue.length, index, repeat, auto);
        if (n === null) {
          set({ playing: false });
          return false;
        }
        set({ index: n, playing: true });
        return true;
      },
      prev: (currentTime) => {
        const { queue, index, repeat } = get();
        set({ index: prevIndex(queue.length, index, repeat, currentTime), playing: true });
      },
      toggleShuffle: () => {
        const { shuffle, queue, index, unshuffled } = get();
        if (!shuffle) {
          set({ shuffle: true, unshuffled: queue, queue: shuffleFrom(queue, index), index: index === -1 ? -1 : 0 });
        } else {
          const current = queue[index];
          // Restore the original order, keeping any tracks added while shuffled.
          const base = unshuffled ?? queue;
          const ids = new Set(base.map((t) => t.id));
          const restored = [...base, ...queue.filter((t) => !ids.has(t.id))];
          set({ shuffle: false, unshuffled: null, queue: restored, index: current ? restored.findIndex((t) => t.id === current.id) : -1 });
        }
      },
      cycleRepeat: () => set({ repeat: ({ off: 'all', all: 'one', one: 'off' } as const)[get().repeat] }),
      setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)), muted: false }),
      toggleMute: () => set({ muted: !get().muted }),
      setPlaying: (p) => set({ playing: p && get().index !== -1 }),
      togglePlay: () => set({ playing: !get().playing && get().index !== -1 }),
      clear: () => set({ queue: [], index: -1, unshuffled: null, playing: false, radioFor: null }),
    }),
    {
      name: 'echo-player',
      version: 1,
      // Never resume audio automatically after a reload.
      partialize: ({ playing: _p, ...rest }) => rest,
    },
  ),
);

export const useCurrentTrack = () => usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : undefined));

interface UiState {
  panel: 'queue' | 'lyrics' | 'jam' | null;
  nowPlaying: boolean;
  setPanel: (p: UiState['panel']) => void;
  togglePanel: (p: 'queue' | 'lyrics' | 'jam') => void;
  setNowPlaying: (open: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      panel: 'queue',
      nowPlaying: false,
      setPanel: (panel) => set({ panel }),
      togglePanel: (p) => set({ panel: get().panel === p ? null : p }),
      setNowPlaying: (nowPlaying) => set({ nowPlaying }),
    }),
    { name: 'echo-ui', partialize: ({ panel }) => ({ panel }) },
  ),
);
