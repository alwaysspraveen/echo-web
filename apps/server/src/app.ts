// All API routes. Used by the local server (index.ts) and the Vercel function (vercel.ts).
import { Hono } from 'hono';
import { getAlbum, getArtist, getCharts, getHome, getMoodCategory, getMoods, getPlaylist, getPodcasts, getRadio, search, suggest } from './yt.ts';
import { QUALITIES, streamAudio, type Quality } from './stream.ts';
import { findLyrics } from './lyrics.ts';
import { allowedArtUrl, fetchArt } from './art.ts';
import { downloadTrack } from './download.ts';
import { isAllowedAudio, manifestName, normalizeBase, resolveExtension } from './extensions.ts';
import { findCanvas } from './canvas.ts';

const VIDEO_ID = /^[\w-]{11}$/;
const BROWSE_ID = /^[\w-]{2,80}$/;

export const app = new Hono();
const api = new Hono();

api.get('/home', async (c) => c.json(await getHome()));

api.get('/charts', async (c) => c.json(await getCharts()));
api.get('/podcasts', async (c) => c.json(await getPodcasts()));
api.get('/moods', async (c) => c.json(await getMoods()));
api.get('/moods/:params', async (c) => {
  const params = c.req.param('params');
  if (!/^[\w%=-]{4,200}$/.test(params)) return c.json({ error: 'Bad category' }, 400);
  return c.json(await getMoodCategory(decodeURIComponent(params)));
});

// Audio extensions (320 kbps / lossless), like Echo for Android's Extension Sources.
api.get('/extension/manifest', async (c) => {
  const base = normalizeBase(c.req.query('base'));
  if (!base) return c.json({ error: 'Enter an http(s) address' }, 400);
  const name = await manifestName(base);
  return name ? c.json({ base, name }) : c.json({ error: "That server didn't answer like an Echo extension (no manifest.json)" }, 404);
});
api.get('/extension/resolve', async (c) => {
  const base = normalizeBase(c.req.query('base'));
  const title = c.req.query('title')?.slice(0, 300);
  const artist = c.req.query('artist')?.slice(0, 300) ?? '';
  if (!base || !title) return c.json({ error: 'Missing base or title' }, 400);
  const stream = await resolveExtension(base, title, artist, Number(c.req.query('duration')) || undefined);
  return stream ? c.json(stream) : c.json({ error: 'Not available on this extension' }, 404);
});

// Streams an extension's audio through this server (same-origin, so the equalizer can process it).
api.get('/extension/audio', async (c) => {
  const url = c.req.query('u') ?? '';
  if (!isAllowedAudio(url)) return c.json({ error: 'Unknown audio link' }, 403);
  const upstream = await fetch(url, { headers: c.req.header('range') ? { Range: c.req.header('range')! } : {}, signal: c.req.raw.signal });
  const headers = new Headers({ 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  for (const h of ['content-type', 'content-length', 'content-range']) { const v = upstream.headers.get(h); if (v) headers.set(h, v); }
  if (!upstream.headers.get('content-type') || upstream.headers.get('content-type') === 'application/octet-stream') {
    if (/flac/i.test(url) || /monochrome/.test(url)) headers.set('Content-Type', 'audio/flac');
  }
  return new Response(upstream.body, { status: upstream.status, headers });
});

api.get('/canvas', async (c) => {
  const title = c.req.query('title')?.slice(0, 300);
  const artist = c.req.query('artist')?.slice(0, 300) ?? '';
  if (!title) return c.json({ error: 'Missing title' }, 400);
  const url = await findCanvas(title, artist);
  return url ? c.json({ url }) : c.json({ error: 'No canvas for this song' }, 404);
});

api.get('/search', async (c) => {
  const q = c.req.query('q')?.trim().slice(0, 200);
  if (!q) return c.json({ error: 'Missing q' }, 400);
  return c.json(await search(q));
});

api.get('/suggest', async (c) => {
  const q = c.req.query('q')?.trim().slice(0, 200);
  return c.json(q ? await suggest(q) : { items: [], queries: [] });
});

api.get('/album/:id', async (c) => {
  const id = c.req.param('id');
  if (!BROWSE_ID.test(id)) return c.json({ error: 'Bad id' }, 400);
  return c.json(await getAlbum(id));
});

api.get('/playlist/:id', async (c) => {
  const id = c.req.param('id');
  if (!BROWSE_ID.test(id)) return c.json({ error: 'Bad id' }, 400);
  return c.json(await getPlaylist(id));
});

api.get('/artist/:id', async (c) => {
  const id = c.req.param('id');
  if (!BROWSE_ID.test(id)) return c.json({ error: 'Bad id' }, 400);
  return c.json(await getArtist(id));
});

api.get('/radio/:id', async (c) => {
  const id = c.req.param('id');
  if (!VIDEO_ID.test(id)) return c.json({ error: 'Bad id' }, 400);
  return c.json(await getRadio(id));
});

api.get('/lyrics', async (c) => {
  const title = c.req.query('title')?.slice(0, 300);
  const artist = c.req.query('artist')?.slice(0, 300) ?? '';
  const duration = Number(c.req.query('duration')) || undefined;
  if (!title) return c.json({ error: 'Missing title' }, 400);
  const lyrics = await findLyrics(title, artist, duration);
  return lyrics ? c.json(lyrics) : c.json({ error: 'No lyrics found' }, 404);
});

api.get('/stream/:id', async (c) => {
  const id = c.req.param('id');
  if (!VIDEO_ID.test(id)) return c.json({ error: 'Bad id' }, 400);
  const q = c.req.query('q') ?? 'high';
  const quality: Quality = (QUALITIES as string[]).includes(q) ? (q as Quality) : 'high';
  return streamAudio(id, quality, c.req.header('range'), c.req.raw.signal);
});

// Same-origin copy of an artwork image so the web app can read its pixels ("Match artwork" theme).
api.get('/art', async (c) => {
  const url = allowedArtUrl(c.req.query('url'));
  if (!url) return c.json({ error: 'Host not allowed' }, 400);
  const art = await fetchArt(url, c.req.raw.signal);
  if (!art) return c.json({ error: 'Not an image' }, 502);
  return c.body(art.bytes, 200, { 'Content-Type': art.type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
});

api.get('/download/:id', async (c) => {
  const id = c.req.param('id');
  if (!VIDEO_ID.test(id)) return c.json({ error: 'Bad id' }, 400);
  const f = c.req.query('format');
  const format = f === 'm4a' || f === 'opus' ? f : 'mp3';
  const clip = (v: string | undefined) => v?.slice(0, 300) || undefined;
  return downloadTrack(
    { id, format, title: clip(c.req.query('title')) ?? id, artist: clip(c.req.query('artist')), album: clip(c.req.query('album')), cover: c.req.query('cover') },
    c.req.raw.signal,
  );
});

api.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: err.message || 'Upstream error' }, 502);
});

app.route('/api', api);
