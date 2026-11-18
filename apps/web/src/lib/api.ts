import { useQuery } from '@tanstack/react-query';
import { getOfflineLyrics } from './offline';
import type { AlbumPage, ArtistPage, Lyrics, PlaylistPage, SearchResults, Shelf, Suggestions, Track } from '@resona/shared';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // No JSON body means the request never reached the Resona server (e.g. Vite's proxy got no answer).
    if (!body) throw new ApiError("Can't reach the Resona server. Start the app with `npm run dev` from the repository folder (not apps/web), and check that terminal for red [server] errors", res.status);
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

export const streamUrl = (id: string, quality: string) => `/api/stream/${id}?q=${quality}`;

/** Same-origin copy of artwork, so canvas can read its pixels. */
export const artUrl = (url: string) => `/api/art?url=${encodeURIComponent(url)}`;

export function downloadUrl(track: Track, format: 'mp3' | 'opus' | 'm4a') {
  const p = new URLSearchParams({ format, title: track.title, artist: track.artists.map((a) => a.name).join(', ') });
  if (track.album?.name) p.set('album', track.album.name);
  if (track.thumbnail) p.set('cover', track.thumbnail);
  return `/api/download/${track.id}?${p}`;
}

export const fetchRadio = (id: string) => get<Track[]>(`/radio/${id}`);

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: ({ signal }) => get<Shelf[]>('/home', signal), staleTime: 10 * 60_000 });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => get<SearchResults>(`/search?q=${encodeURIComponent(q)}`, signal),
    enabled: !!q,
    staleTime: 10 * 60_000,
  });

export const useSuggestions = (q: string) =>
  useQuery({
    queryKey: ['suggest', q],
    queryFn: ({ signal }) => get<Suggestions>(`/suggest?q=${encodeURIComponent(q)}`, signal),
    enabled: q.length > 1,
    staleTime: 10 * 60_000,
    placeholderData: (prev) => prev,
  });

export const useAlbum = (id: string) =>
  useQuery({ queryKey: ['album', id], queryFn: ({ signal }) => get<AlbumPage>(`/album/${id}`, signal), staleTime: Infinity });

export const useArtist = (id: string) =>
  useQuery({ queryKey: ['artist', id], queryFn: ({ signal }) => get<ArtistPage>(`/artist/${id}`, signal), staleTime: 30 * 60_000 });

export const usePlaylist = (id: string) =>
  useQuery({ queryKey: ['playlist', id], queryFn: ({ signal }) => get<PlaylistPage>(`/playlist/${id}`, signal), staleTime: 10 * 60_000 });

export const useLyrics = (track: Track | undefined) =>
  useQuery({
    queryKey: ['lyrics', track?.id],
    enabled: !!track,
    staleTime: Infinity,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
    queryFn: async ({ signal }) => {
      const saved = await getOfflineLyrics(track!.id).catch(() => undefined);
      if (saved !== undefined) return saved;
      const p = new URLSearchParams({ title: track!.title, artist: track!.artists.map((a) => a.name).join(', ') });
      if (track!.duration) p.set('duration', String(track!.duration));
      try {
        return await get<Lyrics>(`/lyrics?${p}`, signal);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });

export interface ExtensionStream { url: string; format?: string; quality?: string; streamQuality?: string; audioQuality?: string; codec?: string | null; bitDepth?: number; sampleRate?: number }

/** Loads a stream in a hidden player and resolves true only if it actually starts (can play) in time. */
function playsWithin(url: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = 'auto';
    probe.muted = true;
    const done = (ok: boolean) => { clearTimeout(timer); probe.removeAttribute('src'); probe.load(); resolve(ok); };
    const timer = setTimeout(() => done(false), ms);
    probe.addEventListener('canplay', () => done(true), { once: true });
    probe.addEventListener('error', () => done(false), { once: true });
    probe.src = url;
  });
}

/**
 * Asks each enabled extension (in order: FLAC, then 320 kbps) for the track, and returns the first
 * stream that really plays. A source that answers but stalls is skipped.
 */
export async function resolveExtensionStream(track: Track, bases: string[]): Promise<ExtensionStream | null> {
  for (const base of bases) {
    const p = new URLSearchParams({ base, title: track.title, artist: track.artists.map((a) => a.name).join(', ') });
    if (track.duration) p.set('duration', String(Math.round(track.duration)));
    const res = await fetch(`/api/extension/resolve?${p}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res?.ok) continue;
    const stream: ExtensionStream = await res.json();
    if (!stream?.url) continue;
    // Play it through Resona's own server (same-origin), so the equalizer can process it.
    stream.url = `/api/extension/audio?u=${encodeURIComponent(stream.url)}`;
    if (await playsWithin(stream.url, 6000)) return stream;
  }
  return null;
}

// ---------- FLAC Mode ----------
/** The FLAC (lossless) extension; FLAC Mode uses only this source. */
export const LOSSLESS_BASE = 'https://lossless-extension-eight-sepia.vercel.app';

/** Searches the FLAC catalog: every result plays in FLAC. */
export const useLosslessSearch = (q: string) =>
  useQuery({
    queryKey: ['lossless-search', q],
    queryFn: ({ signal }) => get<{ tracks: Track[] }>(`/lossless/search?q=${encodeURIComponent(q)}`, signal).then((r) => r.tracks),
    enabled: q.length > 0,
    staleTime: 10 * 60_000,
  });
export const searchLossless = (q: string) => get<{ tracks: Track[] }>(`/lossless/search?q=${encodeURIComponent(q)}`).then((r) => r.tracks);

/** The song's FLAC stream (through Resona's server), or null when it has no FLAC version. */
export async function flacStreamFor(track: Track): Promise<ExtensionStream | null> {
  if (!track.flac) return resolveExtensionStream(track, [LOSSLESS_BASE]);
  const res = await fetch(`/api/lossless/stream/${encodeURIComponent(track.flac)}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) return null;
  const stream: ExtensionStream = await res.json();
  if (!stream?.url) return null;
  stream.url = `/api/extension/audio?u=${encodeURIComponent(stream.url)}`;
  return stream;
}
