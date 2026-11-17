// Jam room model and the pure rules for changing it. Storage lives in store.ts.
import { randomBytes, createHash } from 'node:crypto';

export interface JamTrack {
  id: string;
  title: string;
  artists: { id?: string; name: string }[];
  album?: { id?: string; name: string };
  duration?: number;
  thumbnail?: string;
}

export interface Member {
  id: string;
  name: string;
  tokenHash: string;
  lastSeen: number;
}

export interface Room {
  code: string;
  version: number;
  hostId: string;
  allowControl: boolean;
  members: Member[];
  queue: JamTrack[];
  index: number;
  playing: boolean;
  /** Playback position in seconds, measured at `at` (server ms). */
  position: number;
  at: number;
  /** Who made the last playback change, for "Alex skipped" style notes. */
  changedBy?: string;
  createdAt: number;
}

/** What clients see: no token hashes. */
export type PublicRoom = Omit<Room, 'members'> & { members: { id: string; name: string; active: boolean }[] };

export const LIMITS = { queue: 300, members: 20, name: 30, text: 200 };
const ACTIVE_MS = 45_000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function newCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export const newToken = () => randomBytes(24).toString('base64url');
export const newId = () => randomBytes(6).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('base64url');

export function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name) : '';
  return s || 'Guest';
}

const str = (v: unknown, max = LIMITS.text) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** Validates and trims a track coming from a client. Returns null if it isn't usable. */
export function cleanTrack(v: unknown): JamTrack | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  const id = str(t.id, 11);
  const title = str(t.title);
  if (!id || !/^[\w-]{11}$/.test(id) || !title) return null;
  const artists = Array.isArray(t.artists)
    ? t.artists.slice(0, 10).map((a) => ({ id: str((a as Record<string, unknown>)?.id, 80), name: str((a as Record<string, unknown>)?.name) ?? '' })).filter((a) => a.name)
    : [];
  const album = t.album && typeof t.album === 'object' ? { id: str((t.album as Record<string, unknown>).id, 80), name: str((t.album as Record<string, unknown>).name) ?? '' } : undefined;
  const thumb = str(t.thumbnail, 500);
  return {
    id,
    title,
    artists,
    album: album?.name ? album : undefined,
    duration: typeof t.duration === 'number' && t.duration > 0 && t.duration < 36_000 ? t.duration : undefined,
    thumbnail: thumb && /^https:\/\/[\w.-]+\.(googleusercontent|ytimg|ggpht)\.com\//.test(thumb) ? thumb : undefined,
  };
}

export function createRoom(code: string, hostName: string, hostToken: string, now: number): Room {
  const hostId = newId();
  return {
    code,
    version: 1,
    hostId,
    allowControl: true,
    members: [{ id: hostId, name: hostName, tokenHash: hashToken(hostToken), lastSeen: now }],
    queue: [],
    index: -1,
    playing: false,
    position: 0,
    at: now,
    createdAt: now,
  };
}

export function toPublic(room: Room, now: number): PublicRoom {
  return {
    ...room,
    members: room.members.map((m) => ({ id: m.id, name: m.name, active: now - m.lastSeen < ACTIVE_MS })),
  };
}

export function memberByToken(room: Room, token: string | undefined): Member | undefined {
  if (!token) return undefined;
  const h = hashToken(token);
  return room.members.find((m) => m.tokenHash === h);
}

export const canControl = (room: Room, memberId: string) => room.allowControl || room.hostId === memberId;

export interface PlaybackChange {
  queue: unknown;
  index: unknown;
  playing: unknown;
  position: unknown;
}

/** Applies a full playback snapshot from a member. Returns an error string if it's invalid. */
export function applyPlayback(room: Room, by: Member, change: PlaybackChange, now: number): string | null {
  if (!canControl(room, by.id)) return 'Only the host can control playback in this Jam';
  if (!Array.isArray(change.queue)) return 'Bad queue';
  const queue = change.queue.slice(0, LIMITS.queue).map(cleanTrack).filter((t): t is JamTrack => t !== null);
  const index = Number(change.index);
  if (!Number.isInteger(index) || index < -1 || index >= Math.max(queue.length, 1)) return 'Bad index';
  const position = Number(change.position);
  room.queue = queue;
  room.index = queue.length ? index : -1;
  room.playing = !!change.playing && room.index !== -1;
  room.position = Number.isFinite(position) && position >= 0 ? position : 0;
  room.at = now;
  room.changedBy = by.name;
  return null;
}

/** Anyone in the Jam can add songs to the end of the shared queue. */
export function addTracks(room: Room, by: Member, tracks: unknown, now: number): string | null {
  const list = (Array.isArray(tracks) ? tracks : [tracks]).map(cleanTrack).filter((t): t is JamTrack => t !== null);
  if (!list.length) return 'Bad track';
  const have = new Set(room.queue.map((t) => t.id));
  // Skip songs already queued, including repeats within this same request.
  const fresh = list.filter((t) => !have.has(t.id) && (have.add(t.id), true)).slice(0, LIMITS.queue - room.queue.length);
  if (!fresh.length) return null;
  // If nothing is loaded yet, start from the first added song (paused at 0).
  if (room.index === -1) { room.index = room.queue.length; room.position = 0; room.at = now; }
  room.queue.push(...fresh);
  room.changedBy = by.name;
  return null;
}
