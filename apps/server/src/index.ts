import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getAlbum, getArtist, getHome, getPlaylist, getRadio, search, suggest } from './yt.ts';
import { streamAudio } from './stream.ts';
import { findLyrics } from './lyrics.ts';

const VIDEO_ID = /^[\w-]{11}$/;
const BROWSE_ID = /^[\w-]{2,80}$/;

export const app = new Hono();
const api = new Hono();

api.get('/home', async (c) => c.json(await getHome()));

api.get('/search', async (c) => {
  const q = c.req.query('q')?.trim().slice(0, 200);
  if (!q) return c.json({ error: 'Missing q' }, 400);
  return c.json(await search(q));
});

api.get('/suggest', async (c) => {
  const q = c.req.query('q')?.trim().slice(0, 200);
  return c.json(q ? await suggest(q) : []);
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
  return streamAudio(id, c.req.header('range'), c.req.raw.signal);
});

api.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: err.message || 'Upstream error' }, 502);
});

app.route('/api', api);

// Serve the built web app when it exists (production / future Electron use).
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: webDist }));
  app.get('*', serveStatic({ path: `${webDist}/index.html` }));
}

const port = Number(process.env.PORT ?? 8787);
// Bind to localhost by default: this server proxies audio and should not be exposed by accident.
const hostname = process.env.HOST ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, () => console.log(`Echo server on http://${hostname}:${port}`));
