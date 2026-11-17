import { parseLrc, type Lyrics } from '@echo/shared';

const LRCLIB = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'EchoWeb/0.1 (https://github.com/EchoMusicApp/Echo-Music)' };

interface LrclibRecord {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** Strips "(Official Video)", "[Remastered]", "feat. X" etc. that LRCLIB titles usually lack. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*(official|video|audio|lyric|visuali[sz]er|remaster|live|feat\.?|ft\.)[^)\]]*[)\]]/gi, '')
    .replace(/\s+(feat\.?|ft\.)\s.*$/i, '')
    .trim();
}

const toLyrics = (r: LrclibRecord): Lyrics | null => {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  if (!synced?.length && !r.plainLyrics) return null;
  return { synced: synced?.length ? synced : null, plain: r.plainLyrics, source: 'LRCLIB' };
};

const cache = new Map<string, Lyrics | null>();

export async function findLyrics(title: string, artist: string, duration?: number): Promise<Lyrics | null> {
  const key = `${title}|${artist}|${duration ?? ''}`;
  if (cache.has(key)) return cache.get(key)!;

  const track = cleanTitle(title);
  const firstArtist = artist.split(/,|&| x | and /i)[0].trim();
  let result: Lyrics | null = null;

  const exact = new URLSearchParams({ track_name: track, artist_name: firstArtist });
  if (duration) exact.set('duration', String(Math.round(duration)));
  const res = await fetch(`${LRCLIB}/get?${exact}`, { headers: HEADERS });
  if (res.ok) result = toLyrics((await res.json()) as LrclibRecord);

  if (!result) {
    const q = new URLSearchParams({ track_name: track, artist_name: firstArtist });
    const sres = await fetch(`${LRCLIB}/search?${q}`, { headers: HEADERS });
    if (sres.ok) {
      const list = (await sres.json()) as LrclibRecord[];
      // Prefer synced lyrics, then the closest duration.
      const ranked = list
        .filter((r) => !duration || Math.abs(r.duration - duration) < 8)
        .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) ||
          Math.abs(a.duration - (duration ?? 0)) - Math.abs(b.duration - (duration ?? 0)));
      for (const r of ranked) if ((result = toLyrics(r))) break;
    }
  }

  cache.set(key, result);
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return result;
}
