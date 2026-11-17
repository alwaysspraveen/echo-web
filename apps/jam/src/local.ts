// Local Jam server for development and testing (in-memory unless Upstash env vars are set).
import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 8790);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => console.log(`Echo Jam server on http://127.0.0.1:${port}`));
