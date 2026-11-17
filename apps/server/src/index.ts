import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app.ts';

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
