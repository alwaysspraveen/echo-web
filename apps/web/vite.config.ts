import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Forwards /api/* to the Resona server during development. The server may not get port 8787 (it is
 * often reserved on Windows), so it writes the port it actually got to apps/server/.dev-port and
 * we read that on every request. Responses are piped, so audio streaming and seeking work.
 */
function echoApi(): Plugin {
  const portFile = path.resolve(import.meta.dirname, '../server/.dev-port');
  const serverPort = () => {
    try { return Number(readFileSync(portFile, 'utf8').trim()) || 8787; } catch { return 8787; }
  };
  return {
    name: 'echo-api-forward',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const upstream = http.request(
          { host: '127.0.0.1', port: serverPort(), method: req.method, path: `/api${req.url ?? ''}`, headers: req.headers },
          (up) => {
            res.writeHead(up.statusCode ?? 502, up.headers);
            up.pipe(res);
          },
        );
        upstream.on('error', () => {
          // Plain-text 502: the web app shows "Can't reach the Resona server…" for this.
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Resona server is not running');
        });
        res.on('close', () => upstream.destroy());
        req.pipe(upstream);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), echoApi()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5173 },
  test: { environment: 'node' },
});
