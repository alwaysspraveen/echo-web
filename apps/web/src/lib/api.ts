import { useQuery } from '@tanstack/react-query';
import type { AlbumPage, ArtistPage, Lyrics, PlaylistPage, SearchResults, Shelf, Track } from '@echo/shared';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

export const streamUrl = (id: string) => `/api/stream/${id}`;

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
    queryFn: ({ signal }) => get<string[]>(`/suggest?q=${encodeURIComponent(q)}`, signal),
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
