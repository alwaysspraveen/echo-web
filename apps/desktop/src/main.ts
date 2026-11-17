// Electron main process for Echo Music.
//
// The web app and its API are served through a private "app://echo" scheme handled in-process
// by the same Hono app the local server uses. Nothing listens on a network port, and the origin
// stays the same across launches, so the library in IndexedDB/localStorage persists.
import { app, BrowserWindow, protocol, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEME = 'app';
const HOST = 'echo';
const ORIGIN = `${SCHEME}://${HOST}`;

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: false } },
]);

// Packaged: resources/web and resources/bin/ffmpeg(.exe). Dev: the workspace build + PATH ffmpeg.
const resources = app.isPackaged ? process.resourcesPath : path.resolve(import.meta.dirname, '..');
const webRoot = app.isPackaged ? path.join(resources, 'web') : path.resolve(import.meta.dirname, '../../web/dist');
const bundledFfmpeg = path.join(resources, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
if (app.isPackaged && existsSync(bundledFfmpeg)) process.env.FFMPEG_PATH = bundledFfmpeg;
// The Echo logo for the window (Windows/Linux) and, in dev runs, the macOS Dock.
const iconPath = app.isPackaged ? path.join(resources, 'icon.png') : path.resolve(import.meta.dirname, '../build/icon.png');
app.setName('Echo Music');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon',
};

async function serveStatic(pathname: string): Promise<Response> {
  // Resolve inside webRoot only (no ../ escapes); unknown paths fall back to index.html (SPA routes).
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = path.join(webRoot, rel);
  if (!file.startsWith(webRoot + path.sep) || !existsSync(file) || rel === '') file = path.join(webRoot, 'index.html');
  const body = await readFile(file);
  return new Response(body, { headers: { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' } });
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'Echo Music',
    icon: iconPath,
    backgroundColor: '#191113',
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 22, y: 26 } } : {}),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.loadURL(`${ORIGIN}/`);

  // Keep the window on the app; open http(s) links in the default browser.
  const external = (url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); external(url); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(async () => {
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(iconPath);
    // Load the API after FFMPEG_PATH is set. It's bundled next to this file by scripts/bundle.mjs.
    const { app: api } = await import(pathToFileURL(path.join(import.meta.dirname, 'server.js')).href);

    protocol.handle(SCHEME, async (request) => {
      const url = new URL(request.url);
      if (url.host !== HOST) return new Response('Not found', { status: 404 });
      if (url.pathname.startsWith('/api/')) return api.fetch(request);
      return serveStatic(url.pathname);
    });

    // Downloads (MP3s etc.) go straight to the Downloads folder under the server's filename.
    session.defaultSession.on('will-download', (_e, item) => {
      const dir = app.getPath('downloads');
      const base = item.getFilename();
      const ext = path.extname(base);
      let target = path.join(dir, base);
      for (let i = 2; existsSync(target); i++) target = path.join(dir, `${path.basename(base, ext)} (${i})${ext}`);
      item.setSavePath(target);
    });

    // Allow only writing to the clipboard (Copy room code); deny camera/mic/notifications etc.
    const allowed = new Set(['clipboard-sanitized-write']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

