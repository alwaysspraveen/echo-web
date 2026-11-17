// All API routes. Used by the local server (index.ts) and the Vercel function (vercel.ts).
import { Hono } from 'hono';
import { getAlbum, getArtist, getCharts, getHome, getMoodCategory, getMoods, getPlaylist, getPodcasts, getRadio, search, suggest } from './yt.ts';
import { QUALITIES, streamAudio, type Quality } from './stream.ts';
import { findLyrics } from './lyrics.ts';
import { allowedArtUrl, fetchArt } from './art.ts';
import { downloadTrack } from './download.ts';

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
