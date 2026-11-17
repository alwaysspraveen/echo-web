// Types shared by the server (which produces them) and the web app (which renders them).

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface Track {
  id: string; // YouTube video id
  title: string;
  artists: ArtistRef[];
  album?: { id?: string; name: string };
  duration?: number; // seconds
  thumbnail?: string;
}

export type CardKind = 'album' | 'playlist' | 'artist' | 'song' | 'video';

export interface Card {
  kind: CardKind;
  id: string; // browse id for album/artist/playlist, video id for song/video
  title: string;
  subtitle?: string;
  thumbnail?: string;
  track?: Track; // set for song/video so cards can play directly
}

export interface Shelf {
  title: string;
  items: Card[];
}

export interface SearchResults {
  songs: Track[];
  albums: Card[];
  artists: Card[];
  playlists: Card[];
}

export interface AlbumPage {
  id: string;
  title: string;
  subtitle?: string;
  artist?: ArtistRef;
  thumbnail?: string;
  tracks: Track[];
}

export interface PlaylistPage {
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  tracks: Track[];
}

export interface ArtistPage {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  topSongs: Track[];
  shelves: Shelf[];
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface Lyrics {
  synced: LyricLine[] | null;
  plain: string | null;
  source: string;
}

export interface ApiError {
  error: string;
}

/** Parses LRC text ("[mm:ss.xx] line") into sorted lines. Lines with several timestamps are expanded. */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  const stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lrc.split(/\r?\n/)) {
    const times: number[] = [];
    let m: RegExpExecArray | null;
    let lastIndex = 0;
    stamp.lastIndex = 0;
    while ((m = stamp.exec(raw)) && m.index === lastIndex) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
      lastIndex = stamp.lastIndex;
    }
    if (!times.length) continue;
    const text = raw.slice(lastIndex).trim();
    for (const time of times) out.push({ time, text });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Index of the line active at `time`, or -1 before the first line. */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
