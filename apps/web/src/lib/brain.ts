// Resona Brain: local recommendations from your listening stats:
// per-song listening stats → taste score → recommendations added to the queue as it runs out.
import { create } from 'zustand';
import type { Track } from '@resona/shared';
import { db, type SongStats } from './db';
import { fetchRadio } from './api';

// Scoring constants.
const PLAY_WEIGHT = 2.0;
const SKIP_PENALTY = 3.0;
const LIKED_BONUS = 5.0;
const RECENCY_BONUS = 1.5;
const TIME_OF_DAY_BONUS = 1.3;
const SIMILAR_TRACK_BONUS = 2.0;
const SIMILAR_ARTIST_BONUS = 1.0;
const WEEK = 7 * 86_400_000;
/** A skip is moving on before hearing 85% of a song. */
export const COMPLETION_RATIO = 0.85;

export function timeOfDay(hour = new Date().getHours()) {
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 21) return 'evening';
  return 'night';
}

export function scoreStats(s: Pick<SongStats, 'totalPlayTimeMs' | 'skipCount' | 'lastPlayedAt'>, liked: boolean, tod = timeOfDay(), now = Date.now()) {
  const recent = now - s.lastPlayedAt < WEEK;
  let score = Math.log(1 + Math.max(0, s.totalPlayTimeMs) / 60_000) * PLAY_WEIGHT;
  score -= s.skipCount * SKIP_PENALTY;
  if (liked) score += LIKED_BONUS;
  if (recent) score += RECENCY_BONUS;
  const hourBonus = tod === 'morning' ? (recent ? TIME_OF_DAY_BONUS : 1) : tod === 'night' ? (liked ? TIME_OF_DAY_BONUS : 1) : 1;
  return Math.max(0, score * hourBonus);
}

/** Candidate filter: drop songs you skip and don't actually listen to. */
export const passesFilter = (s: SongStats) => s.skipCount < 2 || s.totalPlayTimeMs > 45_000;

const plain = (t: Track): Track => ({ id: t.id, title: t.title, artists: t.artists, album: t.album, duration: t.duration, thumbnail: t.thumbnail });

export async function recordListen(track: Track, listenedMs: number, skipped: boolean) {
  if (listenedMs <= 0 && !skipped) return;
  const cur = await db.stats.get(track.id);
  await db.stats.put({
    id: track.id,
    track: plain(track),
    totalPlayTimeMs: (cur?.totalPlayTimeMs ?? 0) + Math.max(0, listenedMs),
    skipCount: (cur?.skipCount ?? 0) + (skipped ? 1 : 0),
    lastPlayedAt: Date.now(),
  });
}

/** Songs Resona Brain added (shown with a badge in the queue). */
export const useBrainAdded = create<{ ids: Set<string> }>(() => ({ ids: new Set() }));

/**
 * Picks songs to add after `current`: candidates come from the radio of the current song and of
 * your top-scored song, scored with your stats plus similarity bonuses.
 */
export async function recommend(current: Track, exclude: Set<string>, count = 5): Promise<Track[]> {
  const [stats, likedRows] = await Promise.all([db.stats.toArray(), db.liked.toArray()]);
  const liked = new Set(likedRows.map((l) => l.id));
  const tod = timeOfDay();
  const byId = new Map(stats.map((s) => [s.id, s]));
  const ranked = stats.filter(passesFilter).map((s) => ({ s, score: scoreStats(s, liked.has(s.id), tod) })).sort((a, b) => b.score - a.score);
  const topArtists = new Set(ranked.slice(0, 15).flatMap((r) => r.s.track.artists.map((a) => a.name.toLowerCase())));
  const topSeed = ranked.find((r) => r.s.id !== current.id)?.s.track;

  const [similar, fromTaste] = await Promise.all([
    fetchRadio(current.id).catch(() => [] as Track[]),
    topSeed ? fetchRadio(topSeed.id).catch(() => [] as Track[]) : Promise.resolve([] as Track[]),
  ]);
  const similarIds = new Set(similar.map((t) => t.id));
  const candidates = new Map<string, Track>();
  for (const t of [...similar, ...fromTaste]) if (!exclude.has(t.id) && t.id !== current.id) candidates.set(t.id, t);

  return [...candidates.values()]
    .filter((t) => { const s = byId.get(t.id); return !s || passesFilter(s); })
    .map((t) => {
      const s = byId.get(t.id);
      let score = s ? scoreStats(s, liked.has(t.id), tod) : 0;
      if (similarIds.has(t.id)) score += SIMILAR_TRACK_BONUS;
      if (t.artists.some((a) => topArtists.has(a.name.toLowerCase()))) score += SIMILAR_ARTIST_BONUS;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.t);
}
