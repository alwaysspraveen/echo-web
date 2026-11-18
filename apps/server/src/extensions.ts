// Audio extensions (320 kbps / lossless), ported from Echo for Android's ExtensionManager.kt.
// An extension server exposes:
//   GET {base}/manifest.json        → { id, name, version }
//   GET {base}/search?q=…           → { tracks: [{ id, title, artist, duration }] }
//   GET {base}/stream/{id}?quality=LOSSLESS → { url, format, quality, codec, … }
// The match is strict (same rules as Android) so a wrong song is never played; no match → YouTube.
import { cleanTitle } from './lyrics.ts';

export interface AddonTrack { id: string; title: string; artist: string; duration?: number }
export interface AddonStream { url: string; format?: string; quality?: string; streamQuality?: string; audioQuality?: string; codec?: string | null }

const QUALIFIER_TOKENS = new Set(['remix', 'rmx', 'remaster', 'remastered', 'live', 'instrumental', 'acoustic', 'extended', 'radio', 'edit', 'demo', 'deluxe', 'version', 'sped', 'slowed', 'reverb', 'cover', 'karaoke', 'mix', 'unplugged']);
const CREDIT_TOKENS = new Set(['feat', 'ft', 'featuring', 'prod']);
const ARTIST_STOP_TOKENS = new Set(['the', 'and', 'of', 'with', 'feat', 'ft', 'featuring', 'prod', 'vs']);
const MIN_TOKEN_MATCH_LEN = 3;
const MAX_PREFIX_SUFFIX_LEN = 4;

const normalize = (v: string) => v.toLowerCase().replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
const tokenize = (v: string) => normalize(v).split(' ').filter(Boolean);

function tokensMatch(a: string, b: string) {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < MIN_TOKEN_MATCH_LEN) return false;
  return longer.startsWith(shorter) && longer.length - shorter.length <= MAX_PREFIX_SUFFIX_LEN;
}
function coversAllTokens(a: string[], b: string[]) {
  if (!a.length || !b.length) return false;
  const [fewer, more] = a.length <= b.length ? [a, b] : [b, a];
  return fewer.every((t) => more.some((m) => tokensMatch(t, m)));
}
function artistMatches(want: string[], got: string[]) {
  const w = want.filter((t) => t.length >= 2 && !ARTIST_STOP_TOKENS.has(t));
  const g = got.filter((t) => t.length >= 2 && !ARTIST_STOP_TOKENS.has(t));
  return w.length > 0 && g.length > 0 && w.some((t) => g.includes(t));
}

/** Same scoring as Android's selectBestMatch. */
export function selectBestMatch(tracks: AddonTrack[], title: string, artist: string, durationMs?: number): AddonTrack | null {
  const want = tokenize(title);
  if (!want.length) return null;
  const wantQ = new Set(want.filter((t) => QUALIFIER_TOKENS.has(t)));
  const wantBase = want.filter((t) => !QUALIFIER_TOKENS.has(t) && !CREDIT_TOKENS.has(t));
  if (!wantBase.length) return null;
  const artistTokens = tokenize(artist);
  let best: AddonTrack | null = null;
  let bestScore = -Infinity;
  for (const track of tracks) {
    if (!track?.id || !track.title) continue;
    const got = tokenize(track.title);
    const gotQ = new Set(got.filter((t) => QUALIFIER_TOKENS.has(t)));
    const gotBase = got.filter((t) => !QUALIFIER_TOKENS.has(t) && !CREDIT_TOKENS.has(t));
    if (!gotBase.length || !coversAllTokens(gotBase, wantBase)) continue;
    if (![...wantQ].every((w) => [...gotQ].some((g) => tokensMatch(g, w)))) continue;
    const artistOk = artistMatches(artistTokens, tokenize(track.artist ?? ''));
    if (artistTokens.length && !artistOk) continue;
    let score = gotBase.join(' ') === wantBase.join(' ')
      ? 100
      : Math.trunc((gotBase.filter((g) => wantBase.some((w) => tokensMatch(g, w))).length / Math.max(gotBase.length, wantBase.length)) * 60);
    if (artistOk) score += 60;
    const sameQ = gotQ.size === wantQ.size && [...gotQ].every((q) => wantQ.has(q));
    if (sameQ) score += 20; else if (!wantQ.size) score -= gotQ.size * 5;
    if (durationMs && track.duration) {
      const diff = Math.abs(track.duration * 1000 - durationMs);
      if (diff <= 8000) score += 10; else if (diff <= 20000) score += 3;
    }
    if (score > bestScore) { bestScore = score; best = track; }
  }
  return best;
}

/** Only plain http(s) URLs; trailing slashes and a pasted /manifest.json are trimmed. */
export function normalizeBase(raw: string | undefined): string | null {
  try {
    const u = new URL((raw ?? '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.href.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
  } catch {
    return null;
  }
}

const getJson = async <T>(url: string, ms = 8000): Promise<T | null> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => null)) as T | null) : null;
};

export async function manifestName(base: string): Promise<string | null> {
  const name = (await getJson<{ name?: string }>(`${base}/manifest.json`))?.name;
  if (name) return name;
  // No manifest (e.g. the 320 kbps JioSaavn extension): accept it if /search answers like an extension.
  const probe = await getJson<{ tracks?: unknown }>(`${base}/search?q=hello`, 12000);
  return Array.isArray(probe?.tracks) ? new URL(base).hostname.split('.')[0] : null;
}

const resolved = new Map<string, { at: number; value: AddonStream | null }>();

/** Finds the song on an extension server and returns its high-quality stream, or null. */
export async function resolveExtension(base: string, title: string, artist: string, durationSec?: number): Promise<AddonStream | null> {
  const key = `${base}|${title}|${artist}|${durationSec ?? ''}`;
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) { if (hit.value) allowAudio(hit.value.url); return hit.value; } // extension links expire
  const primaryArtist = artist.split(/[,&•;/]/)[0]?.trim() || artist;
  const q1 = `${cleanTitle(title)} ${primaryArtist}`.trim();
  const q2 = `${title} ${artist}`.trim();
  let value: AddonStream | null = null;
  for (const q of q1 === q2 ? [q1] : [q1, q2]) {
    const found = await getJson<{ tracks?: AddonTrack[] }>(`${base}/search?q=${encodeURIComponent(q)}`);
    const match = selectBestMatch(found?.tracks ?? [], title, artist, durationSec ? durationSec * 1000 : undefined);
    if (!match) continue;
    const stream = await getJson<AddonStream>(`${base}/stream/${encodeURIComponent(match.id)}?quality=LOSSLESS`, 12000);
    if (stream?.url && /^https?:\/\//.test(stream.url)) { value = stream; allowAudio(stream.url); break; }
  }
  resolved.set(key, { at: Date.now(), value });
  if (resolved.size > 500) resolved.delete(resolved.keys().next().value!);
  return value;
}

// Audio links returned by extensions, allowed through /api/extension/audio. Proxying keeps the audio
// same-origin, which the equalizer (Web Audio) needs; only links an extension returned are allowed.
const allowedAudio = new Map<string, number>();
export function allowAudio(url: string) {
  allowedAudio.set(url, Date.now());
  if (allowedAudio.size > 500) allowedAudio.delete(allowedAudio.keys().next().value!);
}
export const isAllowedAudio = (url: string) => {
  const at = allowedAudio.get(url);
  return at !== undefined && Date.now() - at < 6 * 60 * 60_000;
};
