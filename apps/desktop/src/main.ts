// Electron main process for Echo Music.
//
// The web app and its API are served through a private "app://echo" scheme handled in-process
// by the same Hono app the local server uses. Nothing listens on a network port, and the origin
// stays the same across launches, so the library in IndexedDB/localStorage persists.
import { app, BrowserWindow, ipcMain, Menu, MenuItem, protocol, session, shell, systemPreferences } from 'electron';
import { checkForUpdates, startUpdateChecks } from './updater.js';
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
let quitting = false;

/** Bring the window back (or create it if it's gone). */
function showWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(import.meta.dirname, 'preload.cjs') },
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
  // macOS (like Spotify): the close button hides the window and the music keeps playing; clicking
  // Echo in the Dock brings it back. ⌘Q quits for real.
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !quitting) { e.preventDefault(); mainWindow?.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

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

    // Allow writing to the clipboard (Copy room code), full screen video and the microphone
    // (voice search, audio only); deny camera, notifications etc.
    const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, details) => {
      if (perm === 'media') {
        const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
        if (!(types.length > 0 && types.every((t) => t === 'audio'))) return cb(false);
        // macOS also asks the user once (System Settings → Privacy → Microphone).
        if (process.platform === 'darwin') return void systemPreferences.askForMediaAccess('microphone').then(cb, () => cb(false));
        return cb(true);
      }
      cb(allowed.has(perm));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, perm, _origin, details) =>
      allowed.has(perm) || (perm === 'media' && (details as { mediaType?: string }).mediaType === 'audio'));

    createWindow();
    startUpdateChecks();
    ipcMain.handle('echo:version', () => app.getVersion());
    ipcMain.handle('echo:check-updates', () => checkForUpdates(true));
    // "Check for Updates…" in the app menu (macOS) / Help menu.
    const menu = Menu.getApplicationMenu();
    const updateItem = { label: 'Check for Updates…', click: () => checkForUpdates(true) };
    if (menu) {
      const target = process.platform === 'darwin' ? menu.items[0]?.submenu : menu.items.find((m) => m.role === 'help')?.submenu;
      target?.insert(1, new MenuItem(updateItem));
      Menu.setApplicationMenu(menu);
    }
    app.on('activate', showWindow);
    app.on('before-quit', () => { quitting = true; });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

