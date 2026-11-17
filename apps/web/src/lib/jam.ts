// Jam client: create/join a shared listening session on the Echo Jam server, keep the room state
// fresh with long-polling, and send this device's playback changes. JamController applies it.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { Track } from '@echo/shared';

/** The hosted Jam server. Can be changed in Settings (e.g. for a self-hosted one). */
export const DEFAULT_JAM_SERVER = import.meta.env.VITE_JAM_SERVER ?? 'https://echo-jam.vercel.app';

export interface JamMember { id: string; name: string; active: boolean }
export interface JamRoom {
  code: string;
  version: number;
  hostId: string;
  allowControl: boolean;
  members: JamMember[];
  queue: Track[];
  index: number;
  playing: boolean;
  position: number;
  at: number;
  changedBy?: string;
}
interface Session { server: string; code: string; memberId: string; token: string; name: string }

interface JamState {
  session: Session | null;
  room: JamRoom | null;
  /** server clock − local clock, in ms */
  offset: number;
  status: 'idle' | 'connecting' | 'live' | 'reconnecting';
  server: string;
  name: string;
  dialogOpen: boolean;
  setServer: (s: string) => void;
  setDialogOpen: (o: boolean) => void;
}

export const useJam = create<JamState>()(
  persist(
    (set) => ({
      session: null,
      room: null,
      offset: 0,
      status: 'idle',
      server: DEFAULT_JAM_SERVER,
      name: '',
      dialogOpen: false,
      setServer: (server) => set({ server: server.trim().replace(/\/+$/, '') || DEFAULT_JAM_SERVER }),
      setDialogOpen: (dialogOpen) => set({ dialogOpen }),
    }),
    // Keep the session so a reload (or app restart) rejoins the same Jam.
    { name: 'echo-jam', partialize: ({ session, server, name }) => ({ session, server, name }) },
  ),
);

export const isHost = () => { const { session, room } = useJam.getState(); return !!session && room?.hostId === session.memberId; };
export const canControl = () => { const { room } = useJam.getState(); return !!room && (room.allowControl || isHost()); };
/** The room's playback position right now, in seconds. */
export function roomPosition(room: JamRoom, offset = useJam.getState().offset) {
  return room.playing ? room.position + Math.max(0, Date.now() + offset - room.at) / 1000 : room.position;
}

class JamError extends Error { constructor(msg: string, readonly status: number, readonly room?: JamRoom) { super(msg); } }

async function call<T = { room: JamRoom; now: number }>(server: string, path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const sent = Date.now();
  const res = await fetch(`${server}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (body.now && body.room) {
    // Server time when it answered ≈ midpoint of the round trip (good enough for music).
    useJam.setState({ offset: body.now - (sent + Date.now()) / 2 });
  }
  if (!res.ok) throw new JamError(body.error ?? `Jam server error (${res.status})`, res.status, body.room);
  return body as T;
}

const trackOnly = (t: Track): Track => ({ id: t.id, title: t.title, artists: t.artists, album: t.album, duration: t.duration, thumbnail: t.thumbnail });

function setRoom(room: JamRoom) {
  const cur = useJam.getState().room;
  if (!cur || room.version >= cur.version) useJam.setState({ room, status: 'live' });
}

let pollId = 0;
async function pollLoop(id: number) {
  while (id === pollId) {
    const { session, room } = useJam.getState();
    if (!session) return;
    try {
      const r = await call(session.server, `/jam/${session.code}?since=${room?.version ?? 0}`, { token: session.token });
      if (id !== pollId) return;
      setRoom(r.room);
    } catch (e) {
      if (id !== pollId) return;
      if (e instanceof JamError && (e.status === 404 || e.status === 403)) {
        endLocally(e.message);
        return;
      }
      useJam.setState({ status: 'reconnecting' });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
function startPolling() { pollLoop(++pollId); }

function endLocally(message?: string) {
  pollId++;
  useJam.setState({ session: null, room: null, status: 'idle' });
  if (message) toast(message);
}

export async function startJam(name: string, code?: string) {
  const { server } = useJam.getState();
  useJam.setState({ status: 'connecting', name });
  try {
    const r = await call<{ room: JamRoom; memberId: string; token: string; now: number }>(server, '/jam', { method: 'POST', body: JSON.stringify({ name, code: code?.trim() || undefined }) });
    useJam.setState({ session: { server, code: r.room.code, memberId: r.memberId, token: r.token, name }, room: r.room, status: 'live' });
    startPolling();
    return r.room.code;
  } catch (e) {
    useJam.setState({ status: 'idle' });
    throw e instanceof JamError ? e : new Error("Can't reach the Jam server. Check your internet connection.");
  }
}

export async function joinJam(code: string, name: string) {
  const { server } = useJam.getState();
  useJam.setState({ status: 'connecting', name });
  try {
    const r = await call<{ room: JamRoom; memberId: string; token: string; now: number }>(server, `/jam/${code.trim().toUpperCase()}/join`, { method: 'POST', body: JSON.stringify({ name }) });
    useJam.setState({ session: { server, code: r.room.code, memberId: r.memberId, token: r.token, name }, room: r.room, status: 'live' });
    startPolling();
  } catch (e) {
    useJam.setState({ status: 'idle' });
    throw e instanceof JamError ? e : new Error("Can't reach the Jam server. Check your internet connection.");
  }
}

/** Resume a Jam after a reload. */
export function resumeJam() {
  if (useJam.getState().session) { useJam.setState({ status: 'connecting', room: null }); startPolling(); }
}

export async function leaveJam() {
  const { session } = useJam.getState();
  const host = isHost();
  endLocally();
  if (session) await call(session.server, `/jam/${session.code}/leave`, { method: 'POST', token: session.token }).catch(() => {});
  toast(host ? 'Jam ended' : 'You left the Jam');
}

/** Sends this device's full playback state. Returns false if the server rejected it. */
export async function pushPlayback(p: { queue: Track[]; index: number; playing: boolean; position: number }) {
  const { session, room } = useJam.getState();
  if (!session || !room) return false;
  try {
    const r = await call(session.server, `/jam/${session.code}/playback`, {
      method: 'POST',
      token: session.token,
      body: JSON.stringify({ baseVersion: room.version, queue: p.queue.map(trackOnly), index: p.index, playing: p.playing, position: p.position }),
    });
    setRoom(r.room);
    return true;
  } catch (e) {
    if (e instanceof JamError && e.room) setRoom(e.room);
    if (e instanceof JamError && e.status === 403) toast(e.message);
    return false;
  }
}

export async function addToJam(tracks: Track[]) {
  const { session } = useJam.getState();
  if (!session) return;
  try {
    const r = await call(session.server, `/jam/${session.code}/add`, { method: 'POST', token: session.token, body: JSON.stringify({ tracks: tracks.map(trackOnly) }) });
    setRoom(r.room);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export async function setAllowControl(allowControl: boolean) {
  const { session } = useJam.getState();
  if (!session) return;
  const r = await call(session.server, `/jam/${session.code}/settings`, { method: 'POST', token: session.token, body: JSON.stringify({ allowControl }) });
  setRoom(r.room);
}
