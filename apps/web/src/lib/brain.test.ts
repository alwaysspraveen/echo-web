import { describe, expect, it } from 'vitest';
import { passesFilter, scoreStats, timeOfDay } from './brain';

const base = { totalPlayTimeMs: 0, skipCount: 0, lastPlayedAt: 0 };
describe('Echo Brain scoring (same as Android)', () => {
  it('time of day buckets', () => {
    expect([timeOfDay(7), timeOfDay(13), timeOfDay(19), timeOfDay(2)]).toEqual(['morning', 'afternoon', 'evening', 'night']);
  });
  it('rewards listening, likes and recency; penalises skips', () => {
    const now = 10 * 86_400_000;
    const listened = scoreStats({ ...base, totalPlayTimeMs: 600_000, lastPlayedAt: now }, false, 'afternoon', now);
    expect(listened).toBeCloseTo(Math.log(11) * 2 + 1.5, 5);
    expect(scoreStats({ ...base, totalPlayTimeMs: 600_000 }, true, 'night', now)).toBeCloseTo((Math.log(11) * 2 + 5) * 1.3, 5);
    expect(scoreStats({ ...base, skipCount: 3 }, false, 'afternoon', now)).toBe(0);
  });
  it('filters songs skipped twice that were never really listened to', () => {
    expect(passesFilter({ id: 'a', track: { id: 'a', title: 'a', artists: [] }, totalPlayTimeMs: 10_000, skipCount: 2, lastPlayedAt: 0 })).toBe(false);
    expect(passesFilter({ id: 'a', track: { id: 'a', title: 'a', artists: [] }, totalPlayTimeMs: 60_000, skipCount: 3, lastPlayedAt: 0 })).toBe(true);
  });
});
