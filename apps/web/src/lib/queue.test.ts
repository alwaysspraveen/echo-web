import { describe, expect, it } from 'vitest';
import type { Track } from '@echo/shared';
import { activeLineIndex, parseLrc } from '@echo/shared';
import { insertNext, moveItem, nextIndex, prevIndex, removeAt, shuffleFrom } from './queue';

const t = (id: string): Track => ({ id, title: id, artists: [] });
const q = ['a', 'b', 'c', 'd'].map(t);

describe('nextIndex', () => {
  it('advances', () => expect(nextIndex(4, 1, 'off')).toBe(2));
  it('returns null at the end with repeat off', () => expect(nextIndex(4, 3, 'off')).toBeNull());
  it('wraps with repeat all', () => expect(nextIndex(4, 3, 'all')).toBe(0));
  it('stays on the same track for repeat one only when auto-advancing', () => {
    expect(nextIndex(4, 2, 'one', true)).toBe(2);
    expect(nextIndex(4, 2, 'one', false)).toBe(3);
  });
  it('handles an empty queue', () => expect(nextIndex(0, -1, 'all')).toBeNull());
});

describe('prevIndex', () => {
  it('restarts the track when past 3 seconds', () => expect(prevIndex(4, 2, 'off', 10)).toBe(2));
  it('goes back near the start', () => expect(prevIndex(4, 2, 'off', 1)).toBe(1));
  it('wraps to the end with repeat all', () => expect(prevIndex(4, 0, 'all', 0)).toBe(3));
  it('stays at 0 with repeat off', () => expect(prevIndex(4, 0, 'off', 0)).toBe(0));
});

describe('queue edits', () => {
  it('insertNext puts the track after the current one and drops an existing copy', () => {
    const { queue, index } = insertNext(q, 1, t('d'));
    expect(queue.map((x) => x.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(index).toBe(1);
  });
  it('insertNext keeps the current track index when the copy was before it', () => {
    const { queue, index } = insertNext(q, 2, t('a'));
    expect(queue.map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(index).toBe(1);
  });
  it('removeAt before the current track shifts the index', () => {
    const { queue, index } = removeAt(q, 2, 0);
    expect(queue.map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(index).toBe(1);
  });
  it('removeAt of the current track keeps the index pointing at the following track', () => {
    const { queue, index } = removeAt(q, 3, 3);
    expect(queue.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(index).toBe(2);
  });
  it('moveItem tracks the current song', () => {
    const { queue, index } = moveItem(q, 1, 1, 3);
    expect(queue.map((x) => x.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(index).toBe(3);
  });
  it('shuffleFrom keeps the current track first and all tracks present', () => {
    const s = shuffleFrom(q, 2, () => 0.5);
    expect(s[0].id).toBe('c');
    expect(s.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('lyrics', () => {
  const lines = parseLrc('[00:01.50]one\n[00:03.00][00:10.00]two\nno stamp\n[01:02.123]three');
  it('parses and sorts timestamps, expanding repeated lines', () => {
    expect(lines.map((l) => [l.time, l.text])).toEqual([[1.5, 'one'], [3, 'two'], [10, 'two'], [62.123, 'three']]);
  });
  it('finds the active line', () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 2)).toBe(0);
    expect(activeLineIndex(lines, 10)).toBe(2);
    expect(activeLineIndex(lines, 100)).toBe(3);
  });
});
