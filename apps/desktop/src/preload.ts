// Exposes a tiny, fixed API to the web app (no Node access): app version, "check for updates"
// and Google Cast.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const listen = (channel: string) => (cb: (payload: unknown) => void) => {
  const h = (_e: IpcRendererEvent, payload: unknown) => cb(payload);
  ipcRenderer.on(channel, h);
  return () => { ipcRenderer.removeListener(channel, h); };
};

contextBridge.exposeInMainWorld('echoDesktop', {
  version: () => ipcRenderer.invoke('echo:version') as Promise<string>,
  checkForUpdates: () => ipcRenderer.invoke('echo:check-updates') as Promise<void>,
  cast: {
    discover: () => ipcRenderer.invoke('echo:cast-discover'),
    stopDiscovery: () => ipcRenderer.invoke('echo:cast-stop-discovery'),
    connect: (id: string) => ipcRenderer.invoke('echo:cast-connect', id),
    disconnect: () => ipcRenderer.invoke('echo:cast-disconnect'),
    status: () => ipcRenderer.invoke('echo:cast-status'),
    load: (media: unknown, position: number, autoplay: boolean) => ipcRenderer.send('echo:cast-load', media, position, autoplay),
    play: () => ipcRenderer.send('echo:cast-play'),
    pause: () => ipcRenderer.send('echo:cast-pause'),
    seek: (s: number) => ipcRenderer.send('echo:cast-seek', s),
    setVolume: (v: number) => ipcRenderer.send('echo:cast-volume', v),
    onDevices: listen('echo:cast-devices'),
    onStatus: listen('echo:cast-status'),
  },
});
