// Vibe: listen with friends in sync, on Resona's Vibe server.
//
// The server owns each room's timeline (song, playing/paused, and where in the song the room is at
// any moment, on the server's clock). Every device, the host's included, follows that timeline
// (see components/ListenTogetherController.tsx). The host's controls are requests to the server.
// JSON messages over a WebSocket, sent as binary (UTF-8) frames.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { Track } from '@resona/shared';

/** Resona's Vibe server (resona-vibe on Cloudflare). */
export const VIBE_SERVER = 'wss://resona-vibe.praveenkumar75566.workers.dev/vibe';

// ---------- tracks ----------

export interface VibeTrack { id: string; title: string; artist: string; album?: string; duration: number; thumbnail?: string }
export const toVibe = (t: Track): VibeTrack => ({
  id: t.id, title: t.title, artist: t.artists.map((a) => a.name).join(', '), album: t.album?.name,
  duration: t.duration ? Math.round(t.duration * 1000) : 0, thumbnail: t.thumbnail,
});
export const fromVibe = (t: VibeTrack): Track => ({
  id: t.id, title: t.title,
  artists: (t.artist || '').split(/,\s*/).filter(Boolean).map((name) => ({ name })),
  album: t.album ? { name: t.album } : undefined,
  duration: t.duration ? t.duration / 1000 : undefined,
  thumbnail: t.thumbnail,
});

// ---------- state ----------

/** The room's timeline, as decided by the server. `pos` ms into the song at server time `at`. */
export interface Timeline { seq: number; queue: VibeTrack[]; index: number; status: 'idle' | 'loading' | 'playing' | 'paused'; pos: number; at: number }
export interface LtUser { userId: string; username: string; isHost: boolean; isConnected: boolean }
export interface JoinRequest { userId: string; username: string }
export interface Suggestion { id: string; from: string; track: VibeTrack }
interface Session { roomCode: string; userId: string; token: string; username: string }

interface LtState {
  session: Session | null;
  status: 'idle' | 'connecting' | 'waiting' | 'live' | 'reconnecting';
  hostId: string | null;
  users: LtUser[];
  requests: JoinRequest[];
  suggestions: Suggestion[];
  allowControl: boolean;
  timeline: Timeline | null;
  name: string;
  dialogOpen: boolean;
  setDialogOpen: (o: boolean) => void;
}

export const useLt = create<LtState>()(
  persist(
    (set) => ({
      session: null, status: 'idle', hostId: null, users: [], requests: [], suggestions: [], allowControl: false, timeline: null,
      name: '', dialogOpen: false,
      setDialogOpen: (dialogOpen) => set({ dialogOpen }),
    }),
    // Saved: the session (to rejoin after a restart), your name, and who the host is.
    { name: 'echo-vibe', partialize: ({ session, name, hostId }) => ({ session, name, hostId }) },
  ),
);

// Development builds only: inspect the room from the browser console.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __vibe: typeof useLt }).__vibe = useLt;

export const ltIsHost = () => { const s = useLt.getState(); return !!s.session && s.hostId === s.session.userId; };
/** The host controls playback (or everyone, if the host allows it). */
export const ltCanControl = () => ltIsHost() || (!!useLt.getState().session && useLt.getState().allowControl);

// ---------- clock (server time) ----------
// Measured over the room connection itself, NTP-style: keep the round trip with the smallest delay.
let clockOffset = 0; // server − local, ms
let bestRtt = Infinity;
let rttMeasuredAt = 0;
export const serverNow = () => Date.now() + clockOffset;
function onPong(c: number, s: number) {
  const now = Date.now();
  const rtt = now - c;
  // A fresh sample wins if it's as good as the best, or the best is getting old.
  if (rtt <= bestRtt + 5 || now - rttMeasuredAt > 60_000) {
    bestRtt = rtt; rttMeasuredAt = now;
    clockOffset = s + rtt / 2 - now;
  }
}

// ---------- connection ----------

let ws: WebSocket | null = null;
let pingTimer: number | undefined;
let retryTimer: number | undefined;
let retries = 0;
let wanted: { kind: 'create' | 'join' | 'resume'; code?: string } | null = null;
let pending: { resolve: (code: string) => void; reject: (e: Error) => void } | null = null;
const enc = new TextEncoder();
const dec = new TextDecoder();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = Record<string, any>;
function send(m: Msg) { if (ws?.readyState === WebSocket.OPEN) ws.send(enc.encode(JSON.stringify(m))); }

function onMessage(ev: MessageEvent) {
  const m: Msg = JSON.parse(typeof ev.data === 'string' ? ev.data : dec.decode(ev.data as ArrayBuffer));
  const st = useLt.getState();
  switch (m.t) {
    case 'pong': onPong(m.c, m.s); break;
    case 'joined': {
      const session = { roomCode: m.code, userId: m.userId, token: m.token, username: st.name || (wanted?.kind === 'create' ? 'Host' : 'Guest') };
      useLt.setState({ session, status: 'live', requests: [] });
      wanted = { kind: 'resume' };
      pending?.resolve(m.code); pending = null;
      break;
    }
    case 'members':
      useLt.setState({
        hostId: m.hostId, allowControl: !!m.allowControl,
        users: m.members.map((u: Msg) => ({ userId: u.userId, username: u.name, isHost: u.userId === m.hostId, isConnected: !!u.connected })),
      });
      break;
    case 'state': {
      // The server sends its clock with each state: a quick first estimate until pings refine it.
      if (bestRtt === Infinity && typeof m.now === 'number') clockOffset = m.now - Date.now();
      useLt.setState({ timeline: { seq: m.seq, queue: m.queue ?? [], index: m.index ?? 0, status: m.status, pos: m.pos ?? 0, at: m.at ?? 0 } });
      break;
    }
    case 'request':
      if (ltIsHost()) {
        useLt.setState({ requests: [...st.requests.filter((r) => r.userId !== m.userId), { userId: m.userId, username: m.name }] });
        toast(`${m.name} wants to join your Vibe`, { id: `vibe-req-${m.userId}` });
      }
      break;
    case 'suggestion':
      if (ltIsHost()) {
        useLt.setState({ suggestions: [...st.suggestions, { id: m.id, from: m.from, track: m.track }] });
        toast(`${m.from} suggested "${m.track.title}"`, { id: `vibe-sug-${m.id}` });
      }
      break;
    case 'suggestionResult':
      toast(m.accepted ? `The host added "${m.track.title}"` : "The host didn't add your suggestion");
      break;
    case 'declined':
      pending?.reject(new Error('The host declined your request')); pending = null;
      hangUp();
      break;
    case 'kicked':
      endLocally('You were removed from the Vibe');
      break;
    case 'error':
      if (pending) { pending.reject(new Error(m.message || 'Something went wrong')); pending = null; hangUp(); }
      else if (m.code === 'session_ended') endLocally('The Vibe has ended');
      else toast.error(m.message || 'Vibe error', { id: `vibe-err-${m.code}` });
      break;
  }
}

function connect() {
  clearTimeout(retryTimer);
  ws?.close();
  const sock = new WebSocket(VIBE_SERVER);
  ws = sock;
  sock.binaryType = 'arraybuffer';
  sock.onopen = () => {
    retries = 0;
    const st = useLt.getState();
    if (wanted?.kind === 'create') send({ t: 'create', name: st.name || 'Host' });
    else if (wanted?.kind === 'join') send({ t: 'join', code: wanted.code, name: st.name || 'Guest' });
    else if (wanted?.kind === 'resume' && st.session) send({ t: 'resume', token: st.session.token });
    // Clock sync: a burst of pings now, then one every 15 s.
    bestRtt = Infinity;
    for (let i = 0; i < 6; i++) setTimeout(() => send({ t: 'ping', c: Date.now() }), i * 120);
    clearInterval(pingTimer);
    pingTimer = window.setInterval(() => send({ t: 'ping', c: Date.now() }), 15_000);
  };
  sock.onmessage = onMessage;
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    clearInterval(pingTimer);
    if (pending) { pending.reject(new Error("Can't reach the Vibe server. Check your internet connection.")); pending = null; wanted = null; useLt.setState({ status: 'idle' }); return; }
    if (useLt.getState().session) {
      useLt.setState({ status: 'reconnecting' });
      retryTimer = window.setTimeout(connect, Math.min(15_000, 1000 * 2 ** retries++));
    }
  };
}

function hangUp() {
  wanted = null;
  clearInterval(pingTimer); clearTimeout(retryTimer);
  const s = ws; ws = null; s?.close();
}

function endLocally(message?: string) {
  hangUp();
  useLt.setState({ session: null, status: 'idle', hostId: null, users: [], requests: [], suggestions: [], timeline: null });
  if (message) toast(message);
}

function begin(kind: 'create' | 'join', code?: string): Promise<string> {
  hangUp();
  useLt.setState({ status: kind === 'join' ? 'waiting' : 'connecting', session: null, timeline: null });
  wanted = { kind, code };
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    connect();
    setTimeout(() => {
      if (!pending) return;
      pending.reject(new Error(kind === 'join' ? "The host didn't respond. Ask them to let you in, then try again." : "The Vibe server didn't respond"));
      pending = null; hangUp(); useLt.setState({ status: 'idle' });
    }, kind === 'join' ? 90_000 : 15_000);
  });
}

// ---------- room ----------

export function startRoom(name: string) { useLt.setState({ name }); return begin('create'); }
export function joinRoom(code: string, name: string) { useLt.setState({ name }); return begin('join', code.trim().toUpperCase()); }
/** Reconnects to the saved Vibe after a restart. */
export function resumeRoom() { if (useLt.getState().session && !ws) { wanted = { kind: 'resume' }; useLt.setState({ status: 'connecting' }); connect(); } }
export function leaveRoom() {
  const host = ltIsHost();
  send({ t: 'leave' });
  endLocally(host ? 'Vibe ended' : 'You left the Vibe');
}
export function approve(userId: string) { send({ t: 'approve', userId }); useLt.setState({ requests: useLt.getState().requests.filter((r) => r.userId !== userId) }); }
export function decline(userId: string) { send({ t: 'decline', userId }); useLt.setState({ requests: useLt.getState().requests.filter((r) => r.userId !== userId) }); }
export function suggest(track: VibeTrack) { send({ t: 'suggest', track }); }
export function acceptSuggestion(s: Suggestion) { send({ t: 'acceptSuggestion', id: s.id }); useLt.setState({ suggestions: useLt.getState().suggestions.filter((x) => x.id !== s.id) }); }
export function declineSuggestion(s: Suggestion) { send({ t: 'declineSuggestion', id: s.id }); useLt.setState({ suggestions: useLt.getState().suggestions.filter((x) => x.id !== s.id) }); }

// ---------- playback requests (the server applies them and updates everyone's timeline) ----------

export const vibe = {
  load: (queue: Track[], index: number, pos = 0) => send({ t: 'load', queue: queue.map(toVibe), index, pos: Math.round(pos) }),
  queue: (queue: Track[], index: number) => send({ t: 'queue', queue: queue.map(toVibe), index }),
  play: () => send({ t: 'play' }),
  pause: () => send({ t: 'pause' }),
  seek: (ms: number) => send({ t: 'seek', pos: Math.round(ms) }),
  next: () => send({ t: 'next' }),
  prev: () => send({ t: 'prev' }),
  ready: (seq: number) => send({ t: 'ready', seq }),
  sync: () => send({ t: 'sync' }),
};
