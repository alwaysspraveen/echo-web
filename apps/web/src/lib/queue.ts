// Pure queue operations used by the player store. Each returns the new queue and the new index
// of the currently playing track so the store never loses its place.
import type { Track } from '@resona/shared';

export type RepeatMode = 'off' | 'all' | 'one';

/** Index to play after `index`, or null when playback should stop (or fetch radio). */
export function nextIndex(length: number, index: number, repeat: RepeatMode, auto = false): number | null {
  if (length === 0) return null;
  if (repeat === 'one' && auto) return index;
  if (index + 1 < length) return index + 1;
  return repeat === 'all' ? 0 : null;
}

/** "Previous" restarts the current track if more than 3 s in, like most players. */
export function prevIndex(length: number, index: number, repeat: RepeatMode, currentTime: number): number {
  if (currentTime > 3 || length === 0) return index;
  if (index > 0) return index - 1;
  return repeat === 'all' ? length - 1 : 0;
}

export function insertNext(queue: Track[], index: number, track: Track) {
  const existing = queue.findIndex((t) => t.id === track.id);
  if (existing === index) return { queue, index };
  const next = queue.filter((_, i) => i !== existing);
  const cur = existing !== -1 && existing < index ? index - 1 : index;
  next.splice(cur + 1, 0, track);
  return { queue: next, index: cur };
}

export function removeAt(queue: Track[], index: number, at: number) {
  const next = queue.filter((_, i) => i !== at);
  let cur = index;
  if (at < index) cur = index - 1;
  cur = Math.min(cur, next.length - 1);
  return { queue: next, index: cur };
}

export function moveItem(queue: Track[], index: number, from: number, to: number) {
  const next = [...queue];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  let cur = index;
  if (from === index) cur = to;
  else if (from < index && to >= index) cur = index - 1;
  else if (from > index && to <= index) cur = index + 1;
  return { queue: next, index: cur };
}

/** Fisher–Yates shuffle with the current track moved to the front. */
export function shuffleFrom(queue: Track[], index: number, rand: () => number = Math.random): Track[] {
  const rest = queue.filter((_, i) => i !== index);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return index >= 0 && queue[index] ? [queue[index], ...rest] : rest;
}
