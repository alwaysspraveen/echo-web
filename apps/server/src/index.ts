import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app.ts';

// Serve the built web app when it exists (production / single-process mode).
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  app.use('/*', serveStatic({ root: webDist }));
  app.get('*', serveStatic({ path: `${webDist}/index.html` }));
}

// Bind to localhost by default: this server proxies audio and should not be exposed by accident.
const hostname = process.env.HOST ?? '127.0.0.1';
const preferred = Number(process.env.PORT ?? 8787);
// The web dev server (apps/web/vite.config.ts) reads this file to know where to forward /api.
const portFile = fileURLToPath(new URL('../.dev-port', import.meta.url));

/**
 * Listens on the preferred port, or the next free one. On Windows, Hyper-V/WSL/Docker often
 * reserve port blocks (EACCES), and another program may already use the port (EADDRINUSE).
 */
function listen(port: number, attemptsLeft: number) {
  const server = createAdaptorServer({ fetch: app.fetch });
  server.once('error', (err: NodeJS.ErrnoException) => {
    if ((err.code === 'EADDRINUSE' || err.code === 'EACCES') && attemptsLeft > 0) {
      console.warn(`Port ${port} is not available (${err.code}), trying ${port + 1}...`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(`\nResona server could not start: ${err.message}\n`);
      process.exit(1);
    }
  });
  server.listen(port, hostname, () => {
    try { writeFileSync(portFile, String(port)); } catch { /* read-only location: fine outside dev */ }
    console.log(`Resona server on http://${hostname}:${port}`);
  });
}

listen(preferred, 20);
