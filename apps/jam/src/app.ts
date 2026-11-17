// Echo Jam API. Coordinates who is in a Jam, the shared queue, and play/pause/seek. It never
// touches audio: every member's own Echo app streams and plays the songs.
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import {
  addTracks, applyPlayback, canControl, cleanName, createRoom, hashToken, LIMITS, memberByToken, newCode, newId,
  newToken, toPublic, type Room,
} from './room.js';
import { getStore, usingRedis } from './store.js';

// Random codes are 6 unambiguous characters; hosts may also choose their own (4–12 letters/digits).
const CODE = /^[A-Z0-9]{4,12}$/;
const POLL_MS = 20_000; // long-poll window (well under Vercel's function limit)
const POLL_STEP_MS = 700;

export const app = new Hono().basePath('/api');

// The Echo apps run on other origins (localhost, app://echo), and use bearer tokens, not cookies.
app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET', 'POST', 'OPTIONS'], maxAge: 86400 }));

const now = () => Date.now();
const reply = (c: Context, room: Room, extra: Record<string, unknown> = {}, status: 200 | 409 = 200) =>
  c.json({ ...extra, room: toPublic(room, now()), now: now() }, status);
const token = (c: Context) => c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
const body = async (c: Context) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

app.get('/health', (c) => c.json({ ok: true, storage: usingRedis() ? 'redis' : 'memory', now: now() }));

app.post('/jam', async (c) => {
  const b = await body(c);
  const store = getStore();
  const t = newToken();
  if (typeof b.code === 'string' && b.code.trim()) {
    const code = b.code.trim().toUpperCase();
    if (!CODE.test(code)) return c.json({ error: 'Room codes are 4 to 12 letters or digits' }, 400);
    const room = createRoom(code, cleanName(b.name), t, now());
    if (await store.create(room)) return reply(c, room, { memberId: room.hostId, token: t });
    return c.json({ error: `The code ${code} is already in use. Pick another one.` }, 409);
  }
  for (let i = 0; i < 5; i++) {
    const room = createRoom(newCode(), cleanName(b.name), t, now());
    if (await store.create(room)) return reply(c, room, { memberId: room.hostId, token: t });
  }
  return c.json({ error: 'Could not create a Jam, try again' }, 503);
});

app.post('/jam/:code/join', async (c) => {
  const code = c.req.param('code').toUpperCase();
  if (!CODE.test(code)) return c.json({ error: 'That code is not valid' }, 400);
  const b = await body(c);
  const t = newToken();
  const id = newId();
  let full = false;
  const room = await getStore().update(code, (r) => {
    if (r.members.length >= LIMITS.members) { full = true; return false; }
    r.members.push({ id, name: cleanName(b.name), tokenHash: hashToken(t), lastSeen: now() });
    return true;
  });
  if (!room) return c.json({ error: 'No Jam with that code. It may have ended.' }, 404);
  if (full) return c.json({ error: 'This Jam is full' }, 409);
  return reply(c, room, { memberId: id, token: t });
});

/** Long-poll: returns as soon as the room changes past `since`, or after ~20 s. */
app.get('/jam/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const since = Number(c.req.query('since') ?? 0);
  const store = getStore();
  let room = await store.get(code);
  if (!room) return c.json({ error: 'This Jam has ended' }, 404);
  const me = memberByToken(room, token(c));
  if (!me) return c.json({ error: 'You are not in this Jam' }, 403);

  // Mark presence (at most every 15 s so polling doesn't bump the version constantly).
  if (now() - me.lastSeen > 15_000) {
    room = (await store.update(code, (r) => {
      const m = r.members.find((x) => x.id === me.id);
      if (m) m.lastSeen = now();
      return !!m;
    })) ?? room;
  }
  const deadline = now() + POLL_MS;
  while (room.version <= since && now() < deadline && !c.req.raw.signal.aborted) {
    await new Promise((r) => setTimeout(r, POLL_STEP_MS));
    const v = await store.version(code);
    if (v === null) return c.json({ error: 'This Jam has ended' }, 404);
    if (v > room.version) room = (await store.get(code)) ?? room;
  }
  return reply(c, room);
});

/** Full playback snapshot (queue, index, playing, position). Stale snapshots are rejected. */
app.post('/jam/:code/playback', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const b = await body(c);
  let error: string | null = null;
  let stale = false;
  const room = await getStore().update(code, (r) => {
    const me = memberByToken(r, token(c));
    if (!me) { error = 'You are not in this Jam'; return false; }
    if (Number(b.baseVersion) !== r.version) { stale = true; return false; }
    error = applyPlayback(r, me, b as never, now());
    me.lastSeen = now();
    return !error;
  });
  if (!room) return c.json({ error: 'This Jam has ended' }, 404);
  if (stale) return reply(c, room, { error: 'Someone else changed playback first' }, 409);
  if (error) return c.json({ error, room: toPublic(room, now()), now: now() }, 403);
  return reply(c, room);
});

app.post('/jam/:code/add', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const b = await body(c);
  let error: string | null = null;
  const room = await getStore().update(code, (r) => {
    const me = memberByToken(r, token(c));
    if (!me) { error = 'You are not in this Jam'; return false; }
    error = addTracks(r, me, b.tracks, now());
    return !error;
  });
  if (!room) return c.json({ error: 'This Jam has ended' }, 404);
  if (error) return c.json({ error }, 400);
  return reply(c, room);
});

app.post('/jam/:code/settings', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const b = await body(c);
  let denied = false;
  const room = await getStore().update(code, (r) => {
    const me = memberByToken(r, token(c));
    if (!me || me.id !== r.hostId) { denied = true; return false; }
    r.allowControl = !!b.allowControl;
    return true;
  });
  if (!room) return c.json({ error: 'This Jam has ended' }, 404);
  if (denied) return c.json({ error: 'Only the host can change Jam settings' }, 403);
  return reply(c, room);
});

/** Members leave; when the host leaves, the Jam ends for everyone. */
app.post('/jam/:code/leave', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const store = getStore();
  const room = await store.get(code);
  if (!room) return c.json({ ok: true });
  const me = memberByToken(room, token(c));
  if (!me) return c.json({ error: 'You are not in this Jam' }, 403);
  if (me.id === room.hostId) { await store.remove(code); return c.json({ ok: true, ended: true }); }
  await store.update(code, (r) => { r.members = r.members.filter((m) => m.id !== me.id); return true; });
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => c.json({ error: err.message || 'Server error' }, 500));

export { canControl };
