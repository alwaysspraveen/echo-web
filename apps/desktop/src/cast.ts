// Google Cast sender for the desktop app (what Echo for Android does with the Cast SDK, which
// isn't available to Electron). Finds Cast devices on the local network over mDNS, talks the Cast
// v2 protocol to them, and plays songs with Google's Default Media Receiver (CC1AD845), the same
// receiver Android uses.
//
// The device fetches audio from a small HTTP server that only runs while casting. It serves only
// /cast/<random token>/stream/<videoId> (proxied to the app's own API), nothing else.
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import mdns from 'multicast-dns';

export type CastDeviceKind = 'TV' | 'SPEAKER' | 'CHROMECAST' | 'UNKNOWN';
export interface CastDevice { id: string; name: string; model: string; host: string; port: number; kind: CastDeviceKind }
export interface CastMediaInfo { videoId: string; title: string; artist: string; album?: string; artwork?: string; duration?: number }
export interface CastStatus {
  state: 'idle' | 'connecting' | 'connected';
  device: CastDevice | null;
  playerState?: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING';
  idleReason?: string;
  currentTime?: number;
  videoId?: string;
  volume?: number;
  error?: string;
}

const RECEIVER_APP = 'CC1AD845'; // Default Media Receiver
const NS = {
  connection: 'urn:x-cast:com.google.cast.tp.connection',
  heartbeat: 'urn:x-cast:com.google.cast.tp.heartbeat',
  receiver: 'urn:x-cast:com.google.cast.receiver',
  media: 'urn:x-cast:com.google.cast.media',
};

// Device type from name/model, using the keyword lists of Android's CastDevicePickerSheet.
const TV_KEYWORDS = ['tv', 'bravia', 'webos', 'tizen', 'fire tv', 'android tv', 'google tv', 'smart tv', 'display', 'shield', 'monitor', 'hisense', 'tcl', 'samsung tv', 'lg tv', 'sony tv', 'vizio', 'insignia', 'toshiba tv', 'jvc', 'philips tv', 'androidtv'];
const SPEAKER_KEYWORDS = ['home', 'nest', 'speaker', 'audio', 'mini', 'max', 'soundbar', 'sonos', 'bose', 'jbl', 'harman', 'marshall', 'group'];
function kindOf(name: string, model: string): CastDeviceKind {
  const text = `${name} ${model}`.toLowerCase();
  if (TV_KEYWORDS.some((k) => text.includes(k))) return 'TV';
  if (SPEAKER_KEYWORDS.some((k) => text.includes(k))) return 'SPEAKER';
  if (text.includes('chromecast')) return 'CHROMECAST';
  return 'UNKNOWN';
}

// ---------- CastMessage protobuf (hand-encoded; six fields) ----------
function varint(n: number) {
  const out: number[] = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return Buffer.from(out);
}
const field = (no: number, wire: number) => varint((no << 3) | wire);
const str = (no: number, s: string) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([field(no, 2), varint(b.length), b]); };
function encode(source: string, dest: string, namespace: string, payload: object) {
  const body = Buffer.concat([
    field(1, 0), varint(0), // protocol_version CASTV2_1_0
    str(2, source), str(3, dest), str(4, namespace),
    field(5, 0), varint(0), // payload_type STRING
    str(6, JSON.stringify(payload)),
  ]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  return Buffer.concat([len, body]);
}
function decode(buf: Buffer) {
  const msg: Record<number, string | number> = {};
  let i = 0;
  const readVarint = () => { let r = 0, s = 0, b; do { b = buf[i++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return r >>> 0; };
  while (i < buf.length) {
    const key = readVarint();
    const no = key >> 3, wire = key & 7;
    if (wire === 0) msg[no] = readVarint();
    else if (wire === 2) { const l = readVarint(); msg[no] = buf.subarray(i, i + l).toString('utf8'); i += l; }
    else break;
  }
  return { source: String(msg[2] ?? ''), dest: String(msg[3] ?? ''), namespace: String(msg[4] ?? ''), data: typeof msg[6] === 'string' ? safeJson(msg[6]) : null };
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

// ---------- the cast controller ----------
export class Caster {
  private devices = new Map<string, CastDevice>();
  private browser: ReturnType<typeof mdns> | null = null;
  private socket: TLSSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private requestId = 1;
  private transportId = '';
  private sessionId = '';
  private mediaSessionId = 0;
  private server: Server | null = null;
  private token = '';
  private serverPort = 0;
  private status: CastStatus = { state: 'idle', device: null };
  private pendingLoad: { media: CastMediaInfo; position: number; autoplay: boolean } | null = null;

  constructor(
    private readonly onDevices: (devices: CastDevice[]) => void,
    private readonly onStatus: (s: CastStatus) => void,
    /** Serves /api/stream/<id> from the app's own API. */
    private readonly fetchStream: (videoId: string, range: string | undefined, signal: AbortSignal) => Promise<Response>,
  ) {}

  // ----- discovery -----
  startDiscovery() {
    if (this.browser) { this.query(); return; }
    const b = mdns();
    this.browser = b;
    b.on('response', (res) => {
      const records = [...res.answers, ...res.additionals];
      for (const ptr of records.filter((r) => r.type === 'PTR' && r.name === '_googlecast._tcp.local')) {
        const instance = String((ptr as { data?: unknown }).data);
        const srv = records.find((r) => r.type === 'SRV' && r.name === instance) as { data: { port: number; target: string } } | undefined;
        const txt = records.find((r) => r.type === 'TXT' && r.name === instance) as { data: Buffer[] } | undefined;
        if (!srv) continue;
        const a = records.find((r) => r.type === 'A' && r.name === srv.data.target) as { data: string } | undefined;
        const host = a?.data ?? srv.data.target;
        const kv = Object.fromEntries((txt?.data ?? []).map((x) => { const s = x.toString(); const k = s.indexOf('='); return [s.slice(0, k), s.slice(k + 1)]; }));
        const name = kv.fn || instance.split('._googlecast')[0];
        const model = kv.md || '';
        const id = kv.id || instance;
        const device: CastDevice = { id, name, model, host, port: srv.data.port, kind: kindOf(name, model) };
        const prev = this.devices.get(id);
        if (!prev || prev.host !== host || prev.name !== name) { this.devices.set(id, device); this.onDevices([...this.devices.values()]); }
      }
    });
    this.query();
  }
  private query() { this.browser?.query({ questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }] }); }
  stopDiscovery() { this.browser?.destroy(); this.browser = null; }
  listDevices() { return [...this.devices.values()]; }

  // ----- connection -----
  async connect(id: string) {
    const device = this.devices.get(id);
    if (!device) throw new Error('Device not found');
    this.disconnect(false);
    this.setStatus({ state: 'connecting', device, error: undefined });
    await this.ensureServer();
    const socket = tlsConnect({ host: device.host, port: device.port, rejectUnauthorized: false }); // devices use self-signed certs
    this.socket = socket;
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) break;
        this.onMessage(decode(buf.subarray(4, 4 + len)));
        buf = buf.subarray(4 + len);
      }
    });
    socket.on('error', (e) => this.fail(`Could not reach ${device.name}: ${e.message}`));
    socket.on('close', () => { if (this.socket === socket) this.fail(`Lost connection to ${device.name}`); });
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
    this.send('receiver-0', NS.connection, { type: 'CONNECT' });
    this.heartbeat = setInterval(() => {
      this.send('receiver-0', NS.heartbeat, { type: 'PING' });
      this.mediaCmd('GET_STATUS'); // position updates, so the app stays in step
    }, 5000);
    this.send('receiver-0', NS.receiver, { type: 'LAUNCH', appId: RECEIVER_APP, requestId: this.requestId++ });
  }

  disconnect(stopApp = true) {
    if (this.socket && stopApp && this.sessionId) this.send('receiver-0', NS.receiver, { type: 'STOP', sessionId: this.sessionId, requestId: this.requestId++ });
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const s = this.socket;
    this.socket = null;
    s?.end();
    this.transportId = this.sessionId = '';
    this.mediaSessionId = 0;
    this.pendingLoad = null;
    if (stopApp) { this.closeServer(); this.setStatus({ state: 'idle', device: null, playerState: undefined, videoId: undefined, currentTime: undefined }); }
  }

  // ----- media -----
  load(media: CastMediaInfo, position: number, autoplay: boolean) {
    if (!this.transportId) { this.pendingLoad = { media, position, autoplay }; return; }
    const host = this.localAddressFor(this.status.device?.host ?? '');
    const url = `http://${host}:${this.serverPort}/cast/${this.token}/stream/${encodeURIComponent(media.videoId)}`;
    this.send(this.transportId, NS.media, {
      type: 'LOAD',
      requestId: this.requestId++,
      autoplay,
      currentTime: position,
      media: {
        contentId: url,
        contentUrl: url,
        streamType: 'BUFFERED',
        contentType: 'audio/mp4',
        duration: media.duration,
        customData: { mediaId: media.videoId },
        metadata: {
          metadataType: 3, // MUSIC_TRACK
          title: media.title,
          artist: media.artist,
          albumName: media.album,
          images: media.artwork ? [{ url: media.artwork }] : [],
        },
      },
    });
    this.setStatus({ videoId: media.videoId, playerState: 'BUFFERING', currentTime: position });
  }
  play() { this.mediaCmd('PLAY'); }
  pause() { this.mediaCmd('PAUSE'); }
  seek(seconds: number) { this.mediaCmd('SEEK', { currentTime: seconds }); }
  setVolume(level: number) {
    if (this.socket) this.send('receiver-0', NS.receiver, { type: 'SET_VOLUME', volume: { level: Math.max(0, Math.min(1, level)) }, requestId: this.requestId++ });
  }
  private mediaCmd(type: string, extra: object = {}) {
    if (!this.transportId || !this.mediaSessionId) return;
    this.send(this.transportId, NS.media, { type, mediaSessionId: this.mediaSessionId, requestId: this.requestId++, ...extra });
  }

  // ----- protocol -----
  private send(dest: string, namespace: string, payload: object) {
    this.socket?.write(encode('sender-0', dest, namespace, payload));
  }

  private onMessage({ source, namespace, data }: ReturnType<typeof decode>) {
    if (!data) return;
    if (namespace === NS.heartbeat && data.type === 'PING') return this.send(source, NS.heartbeat, { type: 'PONG' });
    if (namespace === NS.connection && data.type === 'CLOSE' && source === this.transportId) return this.fail('The receiver closed the session');
    if (namespace === NS.receiver && data.type === 'RECEIVER_STATUS') {
      const st = data.status ?? {};
      if (typeof st.volume?.level === 'number') this.setStatus({ volume: st.volume.level });
      const app = (st.applications ?? []).find((a: { appId: string }) => a.appId === RECEIVER_APP);
      if (app && app.transportId !== this.transportId) {
        this.transportId = app.transportId;
        this.sessionId = app.sessionId;
        this.send(this.transportId, NS.connection, { type: 'CONNECT' });
        this.setStatus({ state: 'connected' });
        if (this.pendingLoad) { const p = this.pendingLoad; this.pendingLoad = null; this.load(p.media, p.position, p.autoplay); }
      } else if (!app && this.transportId) {
        this.fail('Casting was stopped on the device');
      }
      return;
    }
    if (namespace === NS.receiver && (data.type === 'LAUNCH_ERROR' || data.type === 'INVALID_REQUEST')) return this.fail('The device could not start playback');
    if (namespace === NS.media && data.type === 'MEDIA_STATUS') {
      const m = (data.status ?? [])[0];
      if (!m) return;
      this.mediaSessionId = m.mediaSessionId ?? this.mediaSessionId;
      const videoId = m.media?.customData?.mediaId;
      this.setStatus({ playerState: m.playerState, idleReason: m.idleReason, currentTime: m.currentTime, ...(videoId ? { videoId } : {}) });
    }
    if (namespace === NS.media && (data.type === 'LOAD_FAILED' || data.type === 'LOAD_CANCELLED')) this.setStatus({ error: data.type === 'LOAD_FAILED' ? 'The device could not play this song' : undefined });
  }

  private fail(error: string) {
    if (this.status.state === 'idle') return;
    this.disconnect(false);
    this.closeServer();
    this.setStatus({ state: 'idle', device: null, error, playerState: undefined, videoId: undefined });
  }

  private setStatus(p: Partial<CastStatus>) {
    this.status = { ...this.status, ...p };
    this.onStatus(this.status);
  }
  getStatus() { return this.status; }

  // ----- stream server -----
  private async ensureServer() {
    if (this.server) return;
    this.token = randomBytes(18).toString('base64url');
    const prefix = `/cast/${this.token}/stream/`;
    this.server = createServer(async (req, res) => {
      const url = req.url ?? '';
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
      if (!url.startsWith(prefix)) { res.writeHead(404).end(); return; }
      const id = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
      if (!/^[\w-]{11}$/.test(id)) { res.writeHead(400).end(); return; }
      const ac = new AbortController();
      res.on('close', () => ac.abort());
      try {
        const upstream = await this.fetchStream(id, req.headers.range, ac.signal);
        const headers: Record<string, string> = { 'Access-Control-Allow-Origin': '*' };
        upstream.headers.forEach((v, k) => { if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(k)) headers[k] = v; });
        res.writeHead(upstream.status, headers);
        if (req.method === 'HEAD' || !upstream.body) { res.end(); return; }
        const reader = upstream.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(value)) await new Promise((r) => res.once('drain', r));
        }
        res.end();
      } catch {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      }
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '0.0.0.0', resolve));
    this.serverPort = (this.server.address() as { port: number }).port;
  }
  private closeServer() { this.server?.close(); this.server = null; }

  /** This computer's IPv4 address on the same network as the device. */
  private localAddressFor(deviceHost: string) {
    const all = Object.values(networkInterfaces()).flat().filter((n): n is NonNullable<typeof n> => !!n && n.family === 'IPv4' && !n.internal);
    const same = all.find((n) => {
      const mask = n.netmask.split('.').map(Number), a = n.address.split('.').map(Number), b = deviceHost.split('.').map(Number);
      return b.length === 4 && mask.every((m, i) => (a[i] & m) === (b[i] & m));
    });
    return (same ?? all[0])?.address ?? '127.0.0.1';
  }
}
