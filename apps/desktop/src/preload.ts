// Exposes a tiny, fixed API to the web app (no Node access): app version and "check for updates".
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('echoDesktop', {
  version: () => ipcRenderer.invoke('echo:version') as Promise<string>,
  checkForUpdates: () => ipcRenderer.invoke('echo:check-updates') as Promise<void>,
});
