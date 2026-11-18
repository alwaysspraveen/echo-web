import vm from 'node:vm';
import { Innertube, Platform } from 'youtubei.js';
import type {
  AlbumPage, ArtistPage, ArtistRef, Card, CardKind, PlaylistPage, SearchResults, Shelf, Suggestions, Track,
} from '@resona/shared';

// youtubei.js needs a JS evaluator to decipher stream URLs. YouTube's player script runs
// in a fresh vm context (no access to Node globals) with a hard timeout.
Platform.shim.eval = (data, env) =>
  vm.runInNewContext(
    `(function(){${data.output}\nreturn process(${JSON.stringify(env.n ?? '')}, ${JSON.stringify(env.sp ?? '')}, ${JSON.stringify(env.sig ?? '')});})()`,
    {},
    { timeout: 5000 },
  );

let clientPromise: Promise<Innertube> | null = null;
let clientCreatedAt = 0;
const CLIENT_TTL = 6 * 60 * 60 * 1000; // refresh the session (and player script) every 6h

export function yt(): Promise<Innertube> {
  if (!clientPromise || Date.now() - clientCreatedAt > CLIENT_TTL) {
    clientCreatedAt = Date.now();
    clientPromise = Innertube.create({ generate_session_locally: false, retrieve_player: true }).catch((e) => {
      clientPromise = null;
      throw e;
    });
  }
  return clientPromise;
}

// ---------- small helpers over youtubei.js's loosely typed nodes ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

const text = (v: Node): string | undefined => {
  if (v == null) return undefined;
  const s = typeof v === 'string' ? v : v.toString?.();
  return s && s !== '[object Object]' && s !== 'N/A' ? s : undefined;
};

/** Picks the largest thumbnail and asks Google's image CDN for a crisp size. */
export function thumb(o: Node, size = 544): string | undefined {
  const list: Node[] | undefined =
    o?.thumbnail?.contents ?? (Array.isArray(o?.thumbnail) ? o.thumbnail : undefined) ??
    o?.thumbnails ?? o?.thumbnail?.thumbnails ?? (Array.isArray(o) ? o : undefined);
  if (!list?.length) return undefined;
  const best = [...list].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const url: string | undefined = best?.url;
  if (!url) return undefined;
  return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+/, `=s${size}`);
}

const artistsOf = (o: Node): ArtistRef[] => {
  const list: Node[] = o?.artists?.length ? o.artists : o?.authors?.length ? o.authors : [];
  const refs = list
    .map((a) => ({ id: a.channel_id || a.endpoint?.payload?.browseId || undefined, name: text(a.name) ?? '' }))
    .filter((a) => a.name);
  if (refs.length) return refs;
  const author = text(o?.author?.name ?? o?.author);
  return author ? [{ id: o?.author?.channel_id, name: author }] : [];
};

export function toTrack(o: Node, fallback: Partial<Track> = {}): Track | null {
  const id: string | undefined = o?.video_id ?? o?.id ?? o?.endpoint?.payload?.videoId ?? o?.on_tap?.payload?.videoId; // on_tap: podcast episodes
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const artists = artistsOf(o);
  const albumName = text(o?.album?.name);
  return {
    id,
    title: text(o.title) ?? 'Unknown',
    artists: artists.length ? artists : fallback.artists ?? [],
    album: albumName ? { id: o.album.id, name: albumName } : fallback.album,
    duration: o?.duration?.seconds || fallback.duration,
    thumbnail: thumb(o) ?? fallback.thumbnail,
  };
}

const kindOf = (o: Node): CardKind | null => {
  if (o?.endpoint?.payload?.browseId?.startsWith('MPSP')) return 'playlist'; // podcast shows (labelled 'video')
  if (o?.type === 'MusicMultiRowListItem' && o?.on_tap?.payload?.videoId) return 'song'; // podcast episodes
  switch (o?.item_type) {
    case 'song': return 'song';
    case 'video': return 'video';
    case 'album': return 'album';
    case 'playlist': return 'playlist';
    case 'artist': case 'library_artist': return 'artist';
  }
  const browseId: string | undefined = o?.endpoint?.payload?.browseId;
  if (browseId?.startsWith('MPRE')) return 'album';
  if (browseId?.startsWith('VL')) return 'playlist';
  if (browseId?.startsWith('UC')) return 'artist';
  if (browseId?.startsWith('MPSP')) return 'playlist';
  if (o?.endpoint?.payload?.videoId) return 'song';
  return null;
};

export function toCard(o: Node): Card | null {
  const kind = kindOf(o);
  if (!kind) return null;
  const title = text(o.title) ?? text(o.name);
  if (!title) return null;
  if (kind === 'song' || kind === 'video') {
    const track = toTrack(o);
    if (!track) return null;
    return { kind, id: track.id, title, subtitle: track.artists.map((a) => a.name).join(', ') || text(o.subtitle), thumbnail: track.thumbnail, track };
  }
  let id: string | undefined = o.endpoint?.payload?.browseId ?? o.id;
  if (!id) return null;
  if (id.startsWith('MPSP')) id = `VL${id.slice(4)}`; // podcast show → its episode playlist
  return { kind, id, title, subtitle: text(o.subtitle) ?? artistsOf(o).map((a) => a.name).join(', '), thumbnail: thumb(o) };
}

const cards = (list: Node[] | undefined) => (list ?? []).map(toCard).filter((c): c is Card => c !== null);
const tracks = (list: Node[] | undefined, fb?: Partial<Track>) =>
  (list ?? []).map((o) => toTrack(o, fb)).filter((t): t is Track => t !== null);

const shelfOf = (s: Node): Shelf | null => {
  const title = text(s?.header?.title) ?? text(s?.title);
  const items = cards(s?.contents);
  return title && items.length ? { title, items } : null;
};

// ---------- simple TTL cache ----------

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

const MIN = 60_000;

// ---------- public API ----------

export const getHome = () =>
  cached('home', 15 * MIN, async () => {
    const client = await yt();
    let feed: Node = await client.music.getHomeFeed();
    const shelves: Shelf[] = [];
    for (let page = 0; page < 3; page++) {
      for (const s of feed.sections ?? []) {
        const shelf = shelfOf(s);
        if (shelf) shelves.push(shelf);
      }
      if (!feed.has_continuation) break;
      try { feed = await feed.getContinuation(); } catch { break; }
    }
    return shelves;
  });

export const search = (q: string) =>
  cached(`search:${q}`, 10 * MIN, async (): Promise<SearchResults> => {
    const client = await yt();
    const run = (type: 'song' | 'album' | 'artist' | 'playlist') =>
      client.music.search(q, { type }).then((r: Node) => r.contents?.[0]?.contents ?? []).catch(() => []);
    const [songs, albums, artists, playlists] = await Promise.all([run('song'), run('album'), run('artist'), run('playlist')]);
    return { songs: tracks(songs), albums: cards(albums), artists: cards(artists), playlists: cards(playlists) };
  });

export const suggest = (q: string) =>
  cached(`suggest:${q}`, 10 * MIN, async (): Promise<Suggestions> => {
    const client = await yt();
    const sections: Node[] = await client.music.getSearchSuggestions(q);
    const all: Node[] = sections.flatMap((s) => s.contents ?? []);
    return {
      // Rich results (songs, artists, albums, playlists with artwork), as in YouTube Music's own box.
      items: all.filter((c) => !c.suggestion).map(toCard).filter((c): c is Card => c !== null).slice(0, 6),
      queries: all.map((c) => text(c.suggestion)).filter((s): s is string => !!s).slice(0, 6),
    };
  });

export const getAlbum = (id: string) =>
  cached(`album:${id}`, 60 * MIN, async (): Promise<AlbumPage> => {
    const client = await yt();
    const album: Node = await client.music.getAlbum(id);
    const h = album.header;
    const artistName = text(h?.strapline_text_one) ?? text(h?.author?.name);
    const artist = artistName
      ? { name: artistName, id: h?.strapline_text_one?.endpoint?.payload?.browseId ?? h?.author?.channel_id }
      : undefined;
    const thumbnail = thumb(h);
    const title = text(h?.title) ?? 'Album';
    const list = tracks(album.contents, { artists: artist ? [artist] : [], album: { id, name: title }, thumbnail });
    await swapVideosForSongs(client, album, list);
    return {
      id, title, artist, thumbnail,
      subtitle: [text(h?.subtitle), text(h?.second_subtitle)].filter(Boolean).join(' • '),
      tracks: list,
    };
  });

/**
 * Album pages often link some tracks to their music video (different cut, different length).
 * The album's audio playlist (OLAK5uy_…) has the actual song ids, in the same order; use those.
 */
async function swapVideosForSongs(client: Innertube, album: Node, list: Track[]) {
  if (!album.contents?.some((i: Node) => i.item_type === 'video')) return;
  const audioPlaylist = JSON.stringify(album.header ?? {}).match(/OLAK5uy_[\w-]+/)?.[0]
    ?? JSON.stringify(album.contents ?? []).match(/OLAK5uy_[\w-]+/)?.[0];
  if (!audioPlaylist) return;
  try {
    const pl: Node = await client.music.getPlaylist(audioPlaylist);
    const songs = (pl.items ?? []) as Node[];
    if (songs.length !== list.length) return;
    songs.forEach((s, i) => {
      const songTitle = text(s.title)?.toLowerCase();
      if (s.id && songTitle && songTitle === list[i].title.toLowerCase()) {
        list[i].id = s.id;
        if (s.duration?.seconds) list[i].duration = s.duration.seconds;
      }
    });
  } catch {
    /* keep the video ids */
  }
}

export const getPlaylist = (id: string) =>
  cached(`playlist:${id}`, 30 * MIN, async (): Promise<PlaylistPage> => {
    const client = await yt();
    let pl: Node = await client.music.getPlaylist(id);
    const h = pl.header;
    const items: Node[] = [...(pl.items ?? [])];
    while (pl.has_continuation && items.length < 500) {
      try { pl = await pl.getContinuation(); items.push(...(pl.items ?? pl.contents ?? [])); } catch { break; }
    }
    return {
      id,
      title: text(h?.title) ?? 'Playlist',
      subtitle: [text(h?.subtitle), text(h?.second_subtitle)].filter(Boolean).join(' • '),
      thumbnail: thumb(h),
      tracks: tracks(items),
    };
  });

export const getArtist = (id: string) =>
  cached(`artist:${id}`, 60 * MIN, async (): Promise<ArtistPage> => {
    const client = await yt();
    const artist: Node = await client.music.getArtist(id);
    const h = artist.header;
    const name = text(h?.title) ?? 'Artist';
    let topSongs: Track[] = [];
    const shelves: Shelf[] = [];
    for (const s of artist.sections ?? []) {
      if (s.type === 'MusicShelf' && !topSongs.length) topSongs = tracks(s.contents, { artists: [{ id, name }] });
      else {
        const shelf = shelfOf(s);
        if (shelf) shelves.push(shelf);
      }
    }
    return { id, name, description: text(h?.description), thumbnail: thumb(h, 1200), topSongs, shelves };
  });

export const getRadio = (videoId: string) =>
  cached(`radio:${videoId}`, 30 * MIN, async () => {
    const client = await yt();
    const panel: Node = await client.music.getUpNext(videoId, true);
    const items = (panel.contents ?? []).map((c: Node) => c.primary ?? c);
    return tracks(items).filter((t) => t.id !== videoId);
  });

// ---------- browse: charts, moods & genres, podcasts  ----------

async function browseShelves(browseId: string, params?: string): Promise<Shelf[]> {
  const client = await yt();
  const res: Node = await client.actions.execute('/browse', { browseId, ...(params ? { params } : {}), client: 'YTMUSIC', parse: true });
  const memo = res.contents_memo;
  const shelves: Shelf[] = [];
  for (const s of memo?.get('MusicCarouselShelf') ?? []) { const sh = shelfOf(s); if (sh) shelves.push(sh); }
  for (const s of memo?.get('MusicShelf') ?? []) { const sh = shelfOf(s); if (sh) shelves.push(sh); }
  for (const g of memo?.get('Grid') ?? []) {
    const title = text(g.header?.title) ?? text(g.title) ?? '';
    const items = cards(g.items ?? g.contents);
    if (items.length) shelves.push({ title, items });
  }
  return shelves;
}

export const getCharts = () => cached('charts', 60 * MIN, () => browseShelves('FEmusic_charts'));
export const getPodcasts = () => cached('podcasts', 60 * MIN, () => browseShelves('FEmusic_non_music_audio'));

export interface MoodGroup { title: string; items: { title: string; params: string; color?: string }[] }
export const getMoods = () =>
  cached('moods', 6 * 60 * MIN, async (): Promise<MoodGroup[]> => {
    const client = await yt();
    const res: Node = await client.actions.execute('/browse', { browseId: 'FEmusic_moods_and_genres', client: 'YTMUSIC', parse: true });
    return (res.contents_memo?.get('Grid') ?? []).map((g: Node) => ({
      title: text(g.header?.title) ?? '',
      items: (g.items ?? g.contents ?? [])
        .filter((b: Node) => b.type === 'MusicNavigationButton' && b.endpoint?.payload?.params)
        .map((b: Node) => ({ title: text(b.button_text) ?? '', params: b.endpoint.payload.params, color: b.color ? `#${(Number(b.color) & 0xffffff).toString(16).padStart(6, '0')}` : undefined })),
    })).filter((g: MoodGroup) => g.items.length);
  });
export const getMoodCategory = (params: string) =>
  cached(`mood:${params}`, 60 * MIN, () => browseShelves('FEmusic_moods_and_genres_category', params));
