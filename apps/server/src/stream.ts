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

// Client fallback order. Without a PO token most
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

export type Quality = 'high' | 'normal' | 'low' | 'video';
export const QUALITIES: Quality[] = ['high', 'normal', 'low', 'video'];

// YouTube audio itags in order of preference for each setting:
// 251 Opus ~160k, 140 AAC ~128k, 250 Opus ~70k, 249 Opus ~50k, 139 HE-AAC ~48k.
const ITAG_PREFERENCE: Record<Quality, number[]> = {
  high: [251, 140, 250, 249, 139],
  normal: [140, 251, 250, 139, 249],
  low: [250, 249, 139, 140, 251],
  // Video mode: a video-only stream (the audio keeps playing from the audio stream). 720p/480p/360p H.264, then VP9.
  video: [136, 135, 134, 247, 244, 243],
};

async function resolve(videoId: string, quality: Quality): Promise<Resolved> {
  const client = await getSession();
  let lastError: unknown;
  for (const name of CLIENTS) {
    try {
      const info = await client.getBasicInfo(videoId, { client: name });
      const audio = (info.streaming_data?.adaptive_formats ?? []).filter((f) => (quality === 'video' ? f.has_video && !f.has_audio : f.has_audio && !f.has_video && !f.is_drc));
      const format = ITAG_PREFERENCE[quality].map((itag) => audio.find((f) => f.itag === itag)).find(Boolean)
        ?? audio.sort((a, b) => b.bitrate - a.bitrate)[0];
      if (!format) throw new Error('Streaming data not available');
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
export async function streamAudio(videoId: string, quality: Quality, range: string | undefined, signal: AbortSignal): Promise<Response> {
  const key = `${videoId}:${quality}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let entry = resolved.get(key);
    if (!entry || Date.now() - entry.at > URL_TTL) {
      try {
        entry = await resolve(videoId, quality);
      } catch (e) {
        dropSession();
        if (attempt === MAX_ATTEMPTS - 1) throw e;
        continue;
      }
      resolved.set(key, entry);
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
    resolved.delete(key);
    dropSession();
  }
  throw new Error(`Audio stream unavailable (upstream ${lastStatus})`);
}

/** Downloads the whole audio file by walking bounded ranges (googlevideo rejects open-ended ones). */
export async function fetchWholeAudio(videoId: string, quality: Quality, signal: AbortSignal): Promise<{ bytes: Buffer; mime: string }> {
  const parts: Buffer[] = [];
  let offset = 0;
  let total = Infinity;
  let mime = '';
  while (offset < total) {
    const res = await streamAudio(videoId, quality, `bytes=${offset}-`, signal);
    if (res.status !== 206 && res.status !== 200) throw new Error(`Audio download failed (${res.status})`);
    mime = res.headers.get('content-type') ?? mime;
    const buf = Buffer.from(await res.arrayBuffer());
    const m = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    total = m ? Number(m[1]) : offset + buf.length; // no content-range → whole file in one response
    if (!buf.length) break;
    parts.push(buf);
    offset += buf.length;
  }
  return { bytes: Buffer.concat(parts), mime };
}
