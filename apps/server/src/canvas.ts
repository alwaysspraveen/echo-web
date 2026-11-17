// Canvas: Apple Music motion artwork for the playing song, ported from Echo for Android
// (applecanvas/AppleMusicCanvasProvider.kt + canvas/AppleMusicTokenProvider.kt). The Apple Music web
// player's public read-only token is read from its JS bundle; the song is searched on the catalog
// with ?extend=editorialVideo and the album's motion video (an HLS .m3u8) is returned.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const AMP = 'https://amp-api.music.apple.com';
/** Same preference order as Android. */
const MOTION_KEYS = ['motionSquareVideo1x1', 'motionDetailSquare', 'motionTallVideo3x4', 'motionDetailTall'];

let token: { value: string; exp: number } | null = null;

function jwtExp(jwt: string): number {
  try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).exp * 1000; } catch { return 0; }
}

async function appleToken(): Promise<string | null> {
  if (token && token.exp - Date.now() > 5 * 60_000) return token.value;
  for (const page of ['https://music.apple.com/us/browse', 'https://beta.music.apple.com']) {
    try {
      const html = await (await fetch(page, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(8000) })).text();
      const bundle = html.match(/\/assets\/index[^"'\s]*\.js/)?.[0];
      if (!bundle) continue;
      const js = await (await fetch(bundle.startsWith('http') ? bundle : `https://music.apple.com${bundle}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })).text();
      for (const m of js.matchAll(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        const exp = jwtExp(m[0]);
        if (exp > Date.now()) { token = { value: m[0], exp }; return m[0]; }
      }
    } catch { /* try the next page */ }
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const motionUrl = (ev: Any): string | null => {
  for (const k of MOTION_KEYS) { const v = ev?.[k]?.video; if (typeof v === 'string' && v.startsWith('https://')) return v; }
  return null;
};

const cache = new Map<string, { at: number; url: string | null }>();

export async function findCanvas(title: string, artist: string): Promise<string | null> {
  const key = `${norm(title)}|${norm(artist)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 60 * 60_000) return hit.url;
  const jwt = await appleToken();
  if (!jwt) return null;
  const primaryArtist = artist.split(/[,&]/)[0].trim();
  const p = new URLSearchParams({ term: `${title.replace(/\(.*?\)|\[.*?\]/g, '').trim()} ${primaryArtist}`, types: 'songs', limit: '10', extend: 'editorialVideo', include: 'albums' });
  let url: string | null = null;
  try {
    const res = await fetch(`${AMP}/v1/catalog/us/search?${p}`, {
      headers: { Authorization: `Bearer ${jwt}`, Origin: 'https://music.apple.com', Referer: 'https://music.apple.com/', 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) token = null;
    const body: Any = res.ok ? await res.json() : null;
    const songs: Any[] = body?.results?.songs?.data ?? [];
    const want = norm(title);
    const wantArtist = norm(primaryArtist);
    for (const s of songs) {
      const a = s.attributes ?? {};
      if (!norm(a.name ?? '').startsWith(want) && !want.startsWith(norm(a.name ?? ''))) continue;
      if (wantArtist && !norm(a.artistName ?? '').includes(wantArtist)) continue;
      url = motionUrl(s.relationships?.albums?.data?.[0]?.attributes?.editorialVideo) ?? motionUrl(a.editorialVideo);
      // Search results don't carry the album's motion artwork: fetch the album (id is in the song URL).
      const albumId = typeof a.url === 'string' ? a.url.match(/\/album\/[^/]+\/(\d+)/)?.[1] : undefined;
      if (!url && albumId) {
        const ar = await fetch(`${AMP}/v1/catalog/us/albums/${albumId}?extend=editorialVideo`, {
          headers: { Authorization: `Bearer ${jwt}`, Origin: 'https://music.apple.com', Referer: 'https://music.apple.com/', 'User-Agent': UA },
          signal: AbortSignal.timeout(8000),
        });
        const album: Any = ar.ok ? await ar.json() : null;
        url = motionUrl(album?.data?.[0]?.attributes?.editorialVideo);
      }
      if (url) break;
      if (albumId) break; // the right song was found; its album just has no motion artwork
    }
  } catch { /* no canvas */ }
  cache.set(key, { at: Date.now(), url });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return url;
}
