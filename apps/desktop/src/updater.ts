// In-app updates from GitHub Releases (alwaysspraveen/echo-web).
// - Windows: electron-updater (downloads the new installer and restarts into it).
// - macOS: the app is ad-hoc signed, which Squirrel.Mac can't update, so we download the new .dmg,
//   swap it into /Applications with a small helper script after quitting, and relaunch.
import { app, dialog, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REPO = 'alwaysspraveen/echo-web';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const newer = (a: string, b: string) => {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

let busy = false;

async function checkMac(manual: boolean) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Resona' } });
  if (!res.ok) { if (manual) dialog.showMessageBox({ message: "Couldn't check for updates. Try again later." }); return; }
  const rel = (await res.json()) as { tag_name: string; html_url: string; assets: { name: string; browser_download_url: string }[] };
  if (!newer(rel.tag_name, app.getVersion())) {
    if (manual) dialog.showMessageBox({ message: `Resona ${app.getVersion()} is the latest version.` });
    return;
  }
  const dmg = rel.assets.find((a) => a.name.endsWith(`-${process.arch}.dmg`)) ?? rel.assets.find((a) => a.name.endsWith('.dmg'));
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Update now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Resona ${rel.tag_name.replace(/^v/, '')} is available`,
    detail: `You have ${app.getVersion()}. Resona will download the update, restart and open the new version.`,
  });
  if (response !== 0) return;
  if (!dmg) { shell.openExternal(rel.html_url); return; }

  const dir = await mkdtemp(path.join(tmpdir(), 'echo-update-'));
  const file = path.join(dir, dmg.name);
  const dl = await fetch(dmg.browser_download_url);
  if (!dl.ok || !dl.body) throw new Error(`Download failed (${dl.status})`);
  await pipeline(Readable.fromWeb(dl.body as never), createWriteStream(file));

  // The running bundle, e.g. /Applications/Resona.app
  const bundle = path.resolve(process.execPath, '../../..');
  const script = path.join(dir, 'install.sh');
  await writeFile(script, `#!/bin/bash
# Waits for the app to quit, replaces it with the downloaded version (named as in the .dmg), and reopens it.
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done
MNT=$(hdiutil attach -nobrowse -readonly "${file}" | grep -o "/Volumes/.*" | head -1)
APP=$(ls -d "$MNT"/*.app | head -1)
TARGET="${bundle}"
if [ -n "$APP" ]; then TARGET="$(dirname "${bundle}")/$(basename "$APP")"; rm -rf "${bundle}" "$TARGET" && ditto "$APP" "$TARGET"; fi
hdiutil detach "$MNT" -quiet
open "$TARGET"
rm -rf "${dir}"
`, { mode: 0o755 });
  spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

async function checkWindows(manual: boolean) {
  const { autoUpdater } = await import('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.removeAllListeners();
  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info', buttons: ['Update now', 'Later'], defaultId: 0, cancelId: 1,
      message: `Resona ${info.version} is available`,
      detail: `You have ${app.getVersion()}. Resona will download the update and restart.`,
    });
    if (response === 0) autoUpdater.downloadUpdate();
  });
  autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall(true, true));
  autoUpdater.on('update-not-available', () => { if (manual) dialog.showMessageBox({ message: `Resona ${app.getVersion()} is the latest version.` }); });
  autoUpdater.on('error', (e) => { if (manual) dialog.showMessageBox({ message: `Couldn't update: ${e.message}` }); });
  await autoUpdater.checkForUpdates();
}

export async function checkForUpdates(manual = false) {
  if (!app.isPackaged || busy) return;
  busy = true;
  try {
    if (process.platform === 'darwin') await checkMac(manual);
    else if (process.platform === 'win32') await checkWindows(manual);
  } catch (e) {
    if (manual) dialog.showMessageBox({ message: `Couldn't update: ${(e as Error).message}` });
  } finally {
    busy = false;
  }
}

/** Check shortly after launch, then every 6 hours. */
export function startUpdateChecks() {
  setTimeout(() => checkForUpdates(false), 15_000);
  setInterval(() => checkForUpdates(false), CHECK_EVERY_MS);
}
