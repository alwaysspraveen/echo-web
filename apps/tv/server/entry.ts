// Echo Music for Android TV: the same API server as the desktop app, plus the web UI, served
// on 127.0.0.1 inside the TV app (Node.js for Mobile). Only the app's own WebView can reach it.
import './intl-shim.ts'; // must run before the server modules load
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { app } from '../../server/src/app.ts';

const webRoot = process.argv[2] ?? path.join(path.dirname(process.argv[1] ?? '.'), 'web');
const port = Number(process.argv[3] ?? 47610);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

async function serveStatic(pathname: string) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const file = path.join(webRoot, rel);
  if (file.startsWith(webRoot) && path.extname(file)) {
    try { return new Response(await readFile(file), { headers: { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' } }); } catch { /* fall through */ }
  }
  // Single-page app: every other path gets index.html.
  return new Response(await readFile(path.join(webRoot, 'index.html')), { headers: { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' } });
}

serve({
  hostname: '127.0.0.1',
  port,
  fetch: (req) => {
    const url = new URL(req.url);
    return url.pathname.startsWith('/api/') ? app.fetch(req) : serveStatic(url.pathname);
  },
}, () => console.log(`Echo TV server on http://127.0.0.1:${port}`));
