import Dexie, { type EntityTable } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Track } from '@echo/shared';

export interface LikedTrack extends Track {
  likedAt: number;
}
export interface HistoryEntry extends Track {
  playedAt: number;
}
export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  tracks: Track[];
}

class EchoDB extends Dexie {
  liked!: EntityTable<LikedTrack, 'id'>;
  history!: EntityTable<HistoryEntry, 'id'>;
  playlists!: EntityTable<LocalPlaylist, 'id'>;
  constructor() {
    super('echo-web');
    this.version(1).stores({ liked: 'id, likedAt', history: 'id, playedAt', playlists: 'id, createdAt' });
  }
}

export const db = new EchoDB();

const HISTORY_LIMIT = 500;

/** Strips extra fields so only Track data is stored. */
const plain = (t: Track): Track => ({ id: t.id, title: t.title, artists: t.artists, album: t.album, duration: t.duration, thumbnail: t.thumbnail });

export async function toggleLike(track: Track): Promise<boolean> {
  if (await db.liked.get(track.id)) {
    await db.liked.delete(track.id);
    return false;
  }
  await db.liked.put({ ...plain(track), likedAt: Date.now() });
  return true;
}

export async function recordPlay(track: Track) {
  await db.history.put({ ...plain(track), playedAt: Date.now() });
  const count = await db.history.count();
  if (count > HISTORY_LIMIT) {
    const old = await db.history.orderBy('playedAt').limit(count - HISTORY_LIMIT).primaryKeys();
    await db.history.bulkDelete(old);
  }
}

export async function createPlaylist(name: string, tracks: Track[] = []): Promise<string> {
  const id = crypto.randomUUID();
  await db.playlists.add({ id, name: name.trim() || 'New playlist', createdAt: Date.now(), tracks: tracks.map(plain) });
  return id;
}

export async function addToPlaylist(playlistId: string, tracks: Track[]): Promise<number> {
  let added = 0;
  await db.playlists.where('id').equals(playlistId).modify((p) => {
    const have = new Set(p.tracks.map((t) => t.id));
    for (const t of tracks) if (!have.has(t.id)) { p.tracks.push(plain(t)); have.add(t.id); added++; }
  });
  return added;
}

export async function removeFromPlaylist(playlistId: string, trackId: string) {
  await db.playlists.where('id').equals(playlistId).modify((p) => { p.tracks = p.tracks.filter((t) => t.id !== trackId); });
}

export const renamePlaylist = (id: string, name: string) => db.playlists.update(id, { name: name.trim() || 'Untitled' });
export const deletePlaylist = (id: string) => db.playlists.delete(id);

export const useIsLiked = (id: string | undefined) => useLiveQuery(async () => (id ? !!(await db.liked.get(id)) : false), [id], false);
export const useLiked = () => useLiveQuery(() => db.liked.orderBy('likedAt').reverse().toArray(), [], []);
export const useHistory = () => useLiveQuery(() => db.history.orderBy('playedAt').reverse().limit(200).toArray(), [], []);
export const usePlaylists = () => useLiveQuery(() => db.playlists.orderBy('createdAt').toArray(), [], []);
export const useLocalPlaylist = (id: string) => useLiveQuery(() => db.playlists.get(id), [id]);
