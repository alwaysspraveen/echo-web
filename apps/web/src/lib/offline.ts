// Offline downloads, like the Android app's: the full audio (best quality), artwork and lyrics
// are stored in IndexedDB so songs play with no network. Downloads run two at a time.
import { create } from 'zustand';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import type { Lyrics, Track } from '@echo/shared';
import { artUrl, streamUrl } from './api';
import { db } from './db';

interface OfflineState {
  /** 0..1 for songs currently downloading */
  progress: Record<string, number>;
  /** thumbnail URL → object URL of the stored artwork, so <Artwork> works offline */
  art: Record<string, string>;
}

export const useOffline = create<OfflineState>(() => ({ progress: {}, art: {} }));

const setProgress = (id: string, p: number | null) =>
  useOffline.setState((s) => {
    const progress = { ...s.progress };
    if (p === null) delete progress[id]; else progress[id] = p;
    return { progress };
  });

function rememberArt(thumbnail: string | undefined, blob: Blob | undefined) {
  if (!thumbnail || !blob) return;
  useOffline.setState((s) => (s.art[thumbnail] ? s : { art: { ...s.art, [thumbnail]: URL.createObjectURL(blob) } }));
}

/** Load stored artwork once at startup. */
export async function initOffline() {
  const all = await db.offline.toArray();
  for (const o of all) rememberArt(o.track.thumbnail, o.art);
}

/** Fetches the whole audio file in ranges (the server serves it in chunks), reporting progress. */
async function fetchAudio(track: Track): Promise<Blob> {
  const parts: Blob[] = [];
  let offset = 0;
  let total = Infinity;
  let type = '';
  while (offset < total) {
    const res = await fetch(streamUrl(track.id, 'high'), { headers: { Range: `bytes=${offset}-` } });
    if (!res.ok) throw new Error(`Audio request failed (${res.status})`);
    type = res.headers.get('content-type') ?? type;
    const blob = await res.blob();
    const m = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    total = m ? Number(m[1]) : offset + blob.size;
    if (!blob.size) break;
    parts.push(blob);
    offset += blob.size;
    setProgress(track.id, Math.min(0.95, offset / total));
  }
  return new Blob(parts, { type });
}

async function fetchLyrics(track: Track): Promise<Lyrics | null> {
  const p = new URLSearchParams({ title: track.title, artist: track.artists.map((a) => a.name).join(', ') });
  if (track.duration) p.set('duration', String(track.duration));
  const res = await fetch(`/api/lyrics?${p}`).catch(() => null);
  return res?.ok ? res.json() : null;
}

async function download(track: Track) {
  if (await db.offline.get(track.id)) return;
  setProgress(track.id, 0);
  try {
    const audio = await fetchAudio(track);
    const [art, lyrics] = await Promise.all([
      track.thumbnail ? fetch(artUrl(track.thumbnail)).then((r) => (r.ok ? r.blob() : undefined)).catch(() => undefined) : undefined,
      fetchLyrics(track).catch(() => null),
    ]);
    await db.offline.put({ id: track.id, track, audio, size: audio.size, art, lyrics, savedAt: Date.now() });
    rememberArt(track.thumbnail, art);
  } finally {
    setProgress(track.id, null);
  }
}

// Simple queue: at most two downloads at a time.
const waiting: { track: Track; resolve: (ok: boolean) => void }[] = [];
let running = 0;
function pump() {
  while (running < 2 && waiting.length) {
    const job = waiting.shift()!;
    running++;
    download(job.track)
      .then(() => job.resolve(true))
      .catch(() => job.resolve(false))
      .finally(() => { running--; pump(); });
  }
}
const enqueue = (track: Track) =>
  new Promise<boolean>((resolve) => {
    setProgress(track.id, 0);
    waiting.push({ track, resolve });
    pump();
  });

let askedPersist = false;
function askPersistentStorage() {
  if (askedPersist) return;
  askedPersist = true;
  navigator.storage?.persist?.().catch(() => {});
}

export async function saveOffline(track: Track) {
  if (useOffline.getState().progress[track.id] !== undefined) return;
  if (await db.offline.get(track.id)) { toast(`"${track.title}" is already downloaded`); return; }
  askPersistentStorage();
  toast(`Downloading "${track.title}" for offline`);
  const ok = await enqueue(track);
  if (ok) toast(`"${track.title}" is available offline`);
  else toast.error(`Couldn't download "${track.title}". Check your connection and try again.`);
}

export async function saveAllOffline(tracks: Track[], name: string) {
  const have = new Set(await db.offline.where('id').anyOf(tracks.map((t) => t.id)).primaryKeys());
  const todo = tracks.filter((t) => !have.has(t.id) && useOffline.getState().progress[t.id] === undefined);
  if (!todo.length) { toast(`All of "${name}" is already downloaded`); return; }
  askPersistentStorage();
  toast(`Downloading ${todo.length} song${todo.length > 1 ? 's' : ''} from "${name}" for offline`);
  const results = await Promise.all(todo.map(enqueue));
  const failed = results.filter((r) => !r).length;
  if (failed) toast.error(`${failed} song${failed > 1 ? 's' : ''} from "${name}" couldn't be downloaded`);
  else toast(`"${name}" is available offline`);
}

export async function removeOffline(track: Track) {
  const o = await db.offline.get(track.id);
  await db.offline.delete(track.id);
  if (o?.track.thumbnail) {
    const url = useOffline.getState().art[o.track.thumbnail];
    if (url) {
      URL.revokeObjectURL(url);
      useOffline.setState((s) => { const art = { ...s.art }; delete art[o.track.thumbnail!]; return { art }; });
    }
  }
}

export const getOfflineAudio = (id: string) => db.offline.get(id).then((o) => o?.audio);
export const getOfflineLyrics = (id: string) => db.offline.get(id).then((o) => (o ? o.lyrics ?? null : undefined));

export const useIsOffline = (id: string | undefined) =>
  useLiveQuery(async () => (id ? (await db.offline.where('id').equals(id).count()) > 0 : false), [id], false);

/** Downloaded songs, newest first (without loading the audio into memory). */
export const useOfflineTracks = () =>
  useLiveQuery(async () => {
    const rows = await db.offline.orderBy('savedAt').reverse().toArray();
    return rows.map((r) => ({ track: r.track, size: r.size }));
  }, [], []);

export const useDownloadProgress = (id: string | undefined) => useOffline((s) => (id ? s.progress[id] : undefined));

export const formatBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
