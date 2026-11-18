// Google Cast, like Echo for Android: play on a Chromecast, Google TV or Nest speaker and use
// the app as the remote. Desktop app only (the Electron main process talks to the devices).
import { create } from 'zustand';

export type CastDeviceKind = 'TV' | 'SPEAKER' | 'CHROMECAST' | 'UNKNOWN';
export interface CastDevice { id: string; name: string; model: string; host: string; port: number; kind: CastDeviceKind }
export interface CastMediaInfo { videoId: string; title: string; artist: string; album?: string; artwork?: string; duration?: number }
export interface CastStatus {
  state: 'idle' | 'connecting' | 'connected';
  device: CastDevice | null;
  playerState?: 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING';
  idleReason?: string;
  currentTime?: number;
  videoId?: string;
  volume?: number;
  error?: string;
}

interface CastBridge {
  discover(): Promise<CastDevice[]>;
  stopDiscovery(): Promise<void>;
  connect(id: string): Promise<void>;
  disconnect(): Promise<void>;
  status(): Promise<CastStatus>;
  load(media: CastMediaInfo, position: number, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(level: number): void;
  onDevices(cb: (d: CastDevice[]) => void): () => void;
  onStatus(cb: (s: CastStatus) => void): () => void;
}

export const castBridge: CastBridge | undefined =
  typeof window !== 'undefined' ? (window as unknown as { echoDesktop?: { cast?: CastBridge } }).echoDesktop?.cast : undefined;

interface CastState {
  devices: CastDevice[];
  status: CastStatus;
  /** When the status arrived (to estimate the device's position between updates). */
  statusAt: number;
  pickerOpen: boolean;
  sessionOpen: boolean;
}
export const useCast = create<CastState>(() => ({
  devices: [],
  status: { state: 'idle', device: null },
  statusAt: 0,
  pickerOpen: false,
  sessionOpen: false,
}));

export const isCasting = () => useCast.getState().status.state === 'connected';

/** Cast button: the device picker when not casting, the session sheet when casting. */
export function openCast() {
  const casting = useCast.getState().status.state !== 'idle';
  useCast.setState(casting ? { sessionOpen: true } : { pickerOpen: true });
}

/** Android CastDevicePickerSheet / CastButton device type → icon. */
export const castDeviceName = (s: CastStatus) => s.device?.name ?? 'Cast Device';

let unmuteTo = 0.3;
/** When the user last moved the volume here (device reports are briefly ignored after that). */
export let castVolumeTouchedAt = 0;
/** While casting, the volume slider controls the device's own volume (as on Android). */
export function setCastVolume(level: number) {
  const v = Math.max(0, Math.min(1, level));
  if (v > 0) unmuteTo = v;
  castVolumeTouchedAt = performance.now();
  useCast.setState((s) => ({ status: { ...s.status, volume: v } }));
  castBridge?.setVolume(v);
}
export function toggleCastMute() {
  const v = useCast.getState().status.volume ?? 0;
  setCastVolume(v > 0 ? 0 : unmuteTo);
}
