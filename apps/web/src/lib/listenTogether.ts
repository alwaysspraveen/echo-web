// Listen Together: the Android Echo app's shared-listening protocol, so laptops (web/desktop) and
// phones can be in the same room. Protobuf messages in an Envelope over a WebSocket, on the same
// public servers the Android app uses. Wire format: Echo-Music app/src/main/proto/listentogether.proto.
import protobuf from 'protobufjs';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { Track } from '@echo/shared';
import protoSource from './listentogether.proto?raw';

/** Same default and server list as the Android app (ListenTogetherServers.kt). */
export const DEFAULT_LT_SERVER = 'wss://metroserverx.meowery.eu/ws';
const SERVER_LIST_URL = 'https://raw.githubusercontent.com/EchoMusicApp/Echo-Music/refs/heads/main/app/server.json';

// ---------- wire format ----------

const root = protobuf.parse(protoSource, { keepCase: false }).root;
const T = (name: string) => root.lookupType(`echo.music.iad1tya.listentogether.proto.${name}`);
const Envelope = T('Envelope');

const PAYLOADS: Record<string, string> = {
  create_room: 'CreateRoomPayload', join_room: 'JoinRoomPayload', approve_join: 'ApproveJoinPayload', reject_join: 'RejectJoinPayload',
  playback_action: 'PlaybackActionPayload', buffer_ready: 'BufferReadyPayload', reconnect: 'ReconnectPayload',
  update_room_settings: 'UpdateRoomSettingsPayload', kick_user: 'KickUserPayload',
  room_created: 'RoomCreatedPayload', join_request: 'JoinRequestPayload', join_approved: 'JoinApprovedPayload',
  join_rejected: 'JoinRejectedPayload', user_joined: 'UserJoinedPayload', user_left: 'UserLeftPayload',
  sync_playback: 'PlaybackActionPayload', buffer_wait: 'BufferWaitPayload', buffer_complete: 'BufferCompletePayload',
  error: 'ErrorPayload', host_changed: 'HostChangedPayload', kicked: 'KickedPayload', sync_state: 'SyncStatePayload',
  reconnected: 'ReconnectedPayload', user_reconnected: 'UserReconnectedPayload', user_disconnected: 'UserDisconnectedPayload',
  room_settings_changed: 'UpdateRoomSettingsPayload',
};

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function encode(type: string, payload?: Record<string, unknown>): Uint8Array {
  const name = PAYLOADS[type];
  const body = name && payload ? T(name).encode(T(name).fromObject(payload)).finish() : new Uint8Array();
  return Envelope.encode(Envelope.fromObject({ type, payload: body, compressed: false })).finish();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
async function decode(data: ArrayBuffer): Promise<{ type: string; payload: Any }> {
  const env = Envelope.toObject(Envelope.decode(new Uint8Array(data)), { bytes: Uint8Array }) as { type: string; payload?: Uint8Array; compressed?: boolean };
  const raw = env.payload ?? new Uint8Array();
  const body = env.compressed ? await gunzip(raw) : raw;
  const name = PAYLOADS[env.type];
  const payload = name && body.length ? T(name).toObject(T(name).decode(body), { longs: Number, defaults: true, arrays: true }) : {};
  return { type: env.type, payload };
}

// ---------- tracks ----------

export interface LtTrack { id: string; title: string; artist: string; album?: string; duration: number; thumbnail?: string }

export const toLt = (t: Track): LtTrack => ({
  id: t.id, title: t.title, artist: t.artists.map((a) => a.name).join(', '), album: t.album?.name,
  duration: t.duration ? Math.round(t.duration * 1000) : 180000, thumbnail: t.thumbnail ?? '',
});
export const fromLt = (t: LtTrack): Track => ({
  id: t.id, title: t.title,
  artists: (t.artist || '').split(/,\s*/).filter(Boolean).map((name) => ({ name })),
  album: t.album ? { name: t.album } : undefined,
  duration: t.duration ? t.duration / 1000 : undefined,
  thumbnail: t.thumbnail || undefined,
});

// ---------- state ----------

export interface LtUser { userId: string; username: string; isHost: boolean; isConnected: boolean }
export interface JoinRequest { userId: string; username: string }
export interface PlaybackAction { action: string; trackId?: string; position?: number; trackInfo?: LtTrack; insertNext?: boolean; queue?: LtTrack[]; queueTitle?: string; serverTime?: number }
export interface RoomSnapshot { currentTrack?: LtTrack; isPlaying: boolean; position: number; lastUpdate: number; queue: LtTrack[] }

interface Session { server: string; roomCode: string; userId: string; token: string; username: string }

interface LtState {
  session: Session | null;
  status: 'idle' | 'connecting' | 'waiting' | 'live' | 'reconnecting';
  hostId: string | null;
  users: LtUser[];
  requests: JoinRequest[];
  allowControl: boolean;
  server: string;
  name: string;
  dialogOpen: boolean;
  setServer: (s: string) => void;
  setDialogOpen: (o: boolean) => void;
}

export const useLt = create<LtState>()(
  persist(
    (set) => ({
      session: null, status: 'idle', hostId: null, users: [], requests: [], allowControl: false,
      server: DEFAULT_LT_SERVER, name: '', dialogOpen: false,
      setServer: (server) => set({ server: server.trim() || DEFAULT_LT_SERVER }),
      setDialogOpen: (dialogOpen) => set({ dialogOpen }),
    }),
    { name: 'echo-listen-together', partialize: ({ session, server, name }) => ({ session, server, name }) },
  ),
);

export const ltIsHost = () => { const s = useLt.getState(); return !!s.session && s.hostId === s.session.userId; };
export const ltCanControl = () => ltIsHost() || useLt.getState().allowControl;

// Playback events go to the controller (ListenTogetherController.tsx), which drives the player.
type Listener = { onAction: (a: PlaybackAction) => void; onSnapshot: (s: RoomSnapshot, reason: 'joined' | 'sync') => void; onBufferComplete: (trackId: string) => void; onUserJoined: () => void };
let listener: Listener | null = null;
export const setLtListener = (l: Listener | null) => { listener = l; };

// ---------- connection ----------

let ws: WebSocket | null = null;
let pingTimer: number | undefined;
let retryTimer: number | undefined;
let retries = 0;
let wanted: { kind: 'create' | 'join' | 'reconnect'; code?: string } | null = null;
let pending: { resolve: (v: string) => void; reject: (e: Error) => void } | null = null;

function send(type: string, payload?: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(encode(type, payload));
}

const userFrom = (u: Any): LtUser => ({ userId: u.userId, username: u.username, isHost: !!u.isHost, isConnected: u.isConnected !== false });

function applyRoomState(state: Any, reason: 'joined' | 'sync') {
  useLt.setState({ hostId: state.hostId || useLt.getState().hostId, users: (state.users ?? []).map(userFrom), allowControl: !!state.allowParticipantControl });
  listener?.onSnapshot({ currentTrack: state.currentTrack?.id ? state.currentTrack : undefined, isPlaying: !!state.isPlaying, position: Number(state.position) || 0, lastUpdate: Number(state.lastUpdate) || Date.now(), queue: state.queue ?? [] }, reason);
}

async function onMessage(ev: MessageEvent) {
  const { type, payload: p } = await decode(ev.data as ArrayBuffer);
  const st = useLt.getState();
  switch (type) {
    case 'room_created': {
      const session = { server: st.server, roomCode: p.roomCode, userId: p.userId, token: p.sessionToken, username: st.name || 'Host' };
      useLt.setState({ session, status: 'live', hostId: p.userId, users: [{ userId: p.userId, username: session.username, isHost: true, isConnected: true }], requests: [] });
      pending?.resolve(p.roomCode); pending = null;
      listener?.onUserJoined(); // send our current song so the room has it
      break;
    }
    case 'join_approved': {
      const session = { server: st.server, roomCode: p.roomCode, userId: p.userId, token: p.sessionToken, username: st.name || 'Guest' };
      useLt.setState({ session, status: 'live', requests: [] });
      if (p.state) applyRoomState(p.state, 'joined');
      pending?.resolve(p.roomCode); pending = null;
      break;
    }
    case 'join_rejected':
      pending?.reject(new Error(p.reason ? `The host declined: ${p.reason}` : 'The host declined your request')); pending = null;
      hangUp();
      break;
    case 'reconnected':
      useLt.setState({ status: 'live', hostId: p.isHost ? p.userId : useLt.getState().hostId });
      if (p.state) applyRoomState(p.state, 'sync');
      break;
    case 'join_request':
      if (ltIsHost()) {
        useLt.setState({ requests: [...st.requests.filter((r) => r.userId !== p.userId), { userId: p.userId, username: p.username }] });
        toast(`${p.username} wants to join your Listen Together room`, { id: `lt-req-${p.userId}` });
      }
      break;
    case 'user_joined':
      useLt.setState({ users: [...st.users.filter((u) => u.userId !== p.userId), { userId: p.userId, username: p.username, isHost: false, isConnected: true }] });
      toast(`${p.username} joined`);
      if (ltIsHost()) listener?.onUserJoined();
      break;
    case 'user_left':
      useLt.setState({ users: st.users.filter((u) => u.userId !== p.userId) });
      if (p.username) toast(`${p.username} left`);
      break;
    case 'user_disconnected':
    case 'user_reconnected':
      useLt.setState({ users: st.users.map((u) => (u.userId === p.userId ? { ...u, isConnected: type === 'user_reconnected' } : u)) });
      break;
    case 'host_changed':
      useLt.setState({ hostId: p.newHostId || null });
      if (p.newHostName) toast(`${p.newHostName} is now the host`);
      break;
    case 'room_settings_changed':
      useLt.setState({ allowControl: !!p.allowParticipantControl });
      break;
    case 'sync_playback':
      listener?.onAction(p as PlaybackAction);
      break;
    case 'sync_state':
      listener?.onSnapshot({ currentTrack: p.currentTrack?.id ? p.currentTrack : undefined, isPlaying: !!p.isPlaying, position: Number(p.position) || 0, lastUpdate: Number(p.lastUpdate) || Date.now(), queue: p.queue ?? [] }, 'sync');
      break;
    case 'buffer_complete':
      listener?.onBufferComplete(p.trackId);
      break;
    case 'kicked':
      endLocally(`You were removed from the room${p.reason ? `: ${p.reason}` : ''}`);
      break;
    case 'error': {
      const msg = p.message || p.code || 'Listen Together error';
      if (pending) { pending.reject(new Error(/not.?found|invalid.?room/i.test(msg) ? 'No room with that code' : msg)); pending = null; hangUp(); }
      else if (/session|token|room.*(not|closed)/i.test(msg) && wanted?.kind === 'reconnect') endLocally('The Listen Together room has ended');
      else toast.error(msg);
      break;
    }
  }
}

function connect() {
  const { server } = useLt.getState();
  clearTimeout(retryTimer);
  ws?.close();
  const sock = new WebSocket(server);
  ws = sock;
  sock.binaryType = 'arraybuffer';
  sock.onopen = () => {
    retries = 0;
    const st = useLt.getState();
    if (wanted?.kind === 'create') send('create_room', { username: st.name || 'Host' });
    else if (wanted?.kind === 'join') send('join_room', { roomCode: wanted.code, username: st.name || 'Guest' });
    else if (wanted?.kind === 'reconnect' && st.session) send('reconnect', { sessionToken: st.session.token });
    clearInterval(pingTimer);
    pingTimer = window.setInterval(() => send('ping'), 25_000);
  };
  sock.onmessage = (ev) => { onMessage(ev).catch(() => {}); };
  sock.onclose = () => {
    if (ws !== sock) return; // replaced
    clearInterval(pingTimer);
    if (pending) { pending.reject(new Error("Can't reach the Listen Together server. Check your internet connection.")); pending = null; wanted = null; useLt.setState({ status: 'idle' }); return; }
    if (!useLt.getState().session) return;
    // Lost connection mid-session: reconnect with our session token (backs off up to ~15 s).
    useLt.setState({ status: 'reconnecting' });
    wanted = { kind: 'reconnect' };
    retryTimer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** retries++));
  };
}

function hangUp() {
  wanted = null;
  clearInterval(pingTimer);
  clearTimeout(retryTimer);
  const s = ws; ws = null; s?.close();
}

function endLocally(message?: string) {
  hangUp();
  useLt.setState({ session: null, status: 'idle', hostId: null, users: [], requests: [] });
  if (message) toast(message);
}

const begin = (kind: 'create' | 'join', code?: string) =>
  new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    wanted = { kind, code };
    useLt.setState({ status: kind === 'join' ? 'waiting' : 'connecting', session: null, users: [], requests: [] });
    connect();
    window.setTimeout(() => {
      if (pending) { pending.reject(new Error(kind === 'join' ? 'The host didn’t respond. Ask them to approve your request, then try again.' : 'The Listen Together server didn’t respond')); pending = null; hangUp(); useLt.setState({ status: 'idle' }); }
    }, kind === 'join' ? 90_000 : 15_000);
  });

// ---------- public API ----------

export function startRoom(name: string) { useLt.setState({ name }); return begin('create'); }
export function joinRoom(code: string, name: string) { useLt.setState({ name }); return begin('join', code.trim().toUpperCase()); }
export function resumeRoom() { if (useLt.getState().session && !ws) { wanted = { kind: 'reconnect' }; useLt.setState({ status: 'connecting' }); connect(); } }
export function leaveRoom() {
  const host = ltIsHost();
  send('leave_room');
  endLocally(host ? 'Listen Together ended' : 'You left the room');
}
export function approve(userId: string) { send('approve_join', { userId }); useLt.setState({ requests: useLt.getState().requests.filter((r) => r.userId !== userId) }); }
export function decline(userId: string) { send('reject_join', { userId, reason: 'Declined by host' }); useLt.setState({ requests: useLt.getState().requests.filter((r) => r.userId !== userId) }); }
export function setAllowControl(allow: boolean) { send('update_room_settings', { allowParticipantControl: allow }); useLt.setState({ allowControl: allow }); }
export function sendAction(a: PlaybackAction) { send('playback_action', a as unknown as Record<string, unknown>); }
export function sendBufferReady(trackId: string) { send('buffer_ready', { trackId }); }
export function requestSync() { send('request_sync'); }

/** Picks up the server list the Android app publishes, so both use the same default. */
export async function refreshServerList() {
  try {
    const res = await fetch(SERVER_LIST_URL, { cache: 'no-store' });
    const j = await res.json();
    const url = (Array.isArray(j) ? j[0] : j)?.serverUrl;
    if (typeof url === 'string' && url.startsWith('wss://') && useLt.getState().server === DEFAULT_LT_SERVER) useLt.setState({ server: url });
  } catch { /* keep the built-in default */ }
}
