import { Innertube } from 'youtubei.js';
import './yt.ts'; // installs the JS evaluator used for deciphering

interface Resolved {
  url: string;
  mime: string;
  size: number; // bytes, 0 if unknown
  at: number;
}

const CHUNK = 8 * 1024 * 1024;

/**
 * googlevideo rejects open-ended ranges ("bytes=0-"), which is what browsers send for media.
 * Turn any request into a bounded range of at most CHUNK bytes; the browser asks for the rest.
 */
export function boundedRange(range: string | undefined, size: number): string {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? '');
  let start = m?.[1] ? Number(m[1]) : 0;
  let end = m?.[2] ? Number(m[2]) : NaN;
  if (m && !m[1] && m[2] && size) { start = Math.max(0, size - Number(m[2])); end = size - 1; } // suffix range
  if (Number.isNaN(end)) end = start + CHUNK - 1;
  end = Math.min(end, start + CHUNK - 1);
  if (size) end = Math.min(end, size - 1);
  return `bytes=${start}-${end}`;
}

// Same ordering as Echo-Music's YTPlayerUtils.STREAM_FALLBACK_CLIENTS. Without a PO token most
// clients' URLs serve only the first ~1 MiB; VISIONOS serves the whole file. IOS is a last resort
// because a preview beats silence.
const CLIENTS = ['VISIONOS', 'ANDROID_VR', 'IOS'] as const;

// Streaming needs a real visitor session fetched from YouTube (a locally generated one is refused).
// Sessions occasionally get flagged, so a failing session is thrown away and replaced.
let session: Promise<Innertube> | null = null;
const getSession = () =>
  (session ??= Innertube.create({ generate_session_locally: false, retrieve_player: true }).catch((e) => {
    session = null;
    throw e;
  }));
const dropSession = () => { session = null; };

const URL_TTL = 60 * 60 * 1000;
const resolved = new Map<string, Resolved>();

async function resolve(videoId: string): Promise<Resolved> {
  const client = await getSession();
  let lastError: unknown;
  for (const name of CLIENTS) {
    try {
      const format = await client.getStreamingData(videoId, { type: 'audio', quality: 'best', client: name });
      const url = format.url ?? (await format.decipher(client.session.player));
      return { url, mime: format.mime_type.split(';')[0], size: Number(format.content_length) || 0, at: Date.now() };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No playable audio stream');
}

const MAX_ATTEMPTS = 3;

/**
 * Proxies audio bytes for `videoId`, forwarding the browser's Range header (bounded) so seeking
 * works. If googlevideo rejects the URL, retries with a fresh session.
 */
export async function streamAudio(videoId: string, range: string | undefined, signal: AbortSignal): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let entry = resolved.get(videoId);
    if (!entry || Date.now() - entry.at > URL_TTL) {
      try {
        entry = await resolve(videoId);
      } catch (e) {
        dropSession();
        if (attempt === MAX_ATTEMPTS - 1) throw e;
        continue;
      }
      resolved.set(videoId, entry);
      if (resolved.size > 300) resolved.delete(resolved.keys().next().value!);
    }
    const upstream = await fetch(entry.url, { headers: { Range: boundedRange(range, entry.size) }, signal });
    if (upstream.ok) {
      const headers = new Headers({ 'Content-Type': entry.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      for (const h of ['content-length', 'content-range']) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    await upstream.body?.cancel();
    if (upstream.status === 416) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${entry.size}` } });
    }
    lastStatus = upstream.status;
    resolved.delete(videoId);
    dropSession();
  }
  throw new Error(`Audio stream unavailable (upstream ${lastStatus})`);
}
