import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'high' | 'normal' | 'low';

export const QUALITY_OPTIONS: { id: Quality; name: string; detail: string }[] = [
  { id: 'high', name: 'High', detail: 'Opus, about 160 kbps. Best sound YouTube Music offers without Premium.' },
  { id: 'normal', name: 'Normal', detail: 'AAC, about 128 kbps. Widest compatibility.' },
  { id: 'low', name: 'Data saver', detail: 'Opus, about 70 kbps. Uses roughly half the data.' },
];

export type DownloadFormat = 'mp3' | 'opus' | 'm4a';

export const DOWNLOAD_OPTIONS: { id: DownloadFormat; name: string; detail: string }[] = [
  { id: 'mp3', name: 'MP3, 320 kbps', detail: 'Converted from the best source YouTube has. Plays everywhere: Apple Music, car stereos, phones, DJ software.' },
  { id: 'opus', name: 'Original (.opus)', detail: 'Opus, about 160 kbps, untouched from YouTube. Plays in VLC, browsers, Android and most players, but not Apple Music.' },
  { id: 'm4a', name: 'Original (.m4a)', detail: 'AAC, about 128 kbps. Plays everywhere, including Apple Music and QuickTime.' },
];

export interface Extension { base: string; name: string; enabled: boolean }

/** Built in for Mac and Windows: lossless (FLAC) first, then 320 kbps, then YouTube Music. */
export const DEFAULT_EXTENSIONS: Extension[] = [
  { base: 'https://lossless-extension-eight-sepia.vercel.app', name: 'Lossless (FLAC)', enabled: true },
  { base: 'https://echo-320-extension.vercel.app', name: '320 kbps', enabled: true },
];

/** 'artwork' follows the playing song's cover; anything else is a preset id from theme.ts. */
export type ThemeChoice = 'artwork' | string;

interface Settings {
  quality: Quality;
  theme: ThemeChoice;
  downloadFormat: DownloadFormat;
  crossfade: boolean;
  crossfadeSeconds: number;
  extensions: Extension[];
  preferExtension: boolean;
  echoBrain: boolean;
  canvas: boolean;
  settingsOpen: boolean;
  setQuality: (q: Quality) => void;
  setTheme: (t: ThemeChoice) => void;
  setDownloadFormat: (f: DownloadFormat) => void;
  setCrossfade: (on: boolean) => void;
  setCrossfadeSeconds: (s: number) => void;
  setExtensions: (e: Extension[]) => void;
  setPreferExtension: (on: boolean) => void;
  setEchoBrain: (on: boolean) => void;
  setCanvas: (on: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      quality: 'high',
      theme: 'artwork',
      downloadFormat: 'mp3',
      crossfade: false,
      crossfadeSeconds: 5,
      extensions: DEFAULT_EXTENSIONS,
      preferExtension: true,
      echoBrain: false,
      canvas: true,
      settingsOpen: false,
      setQuality: (quality) => set({ quality }),
      setTheme: (theme) => set({ theme }),
      setDownloadFormat: (downloadFormat) => set({ downloadFormat }),
      setCrossfade: (crossfade) => set({ crossfade }),
      setCrossfadeSeconds: (crossfadeSeconds) => set({ crossfadeSeconds }),
      setExtensions: (extensions) => set({ extensions }),
      setPreferExtension: (preferExtension) => set({ preferExtension }),
      setEchoBrain: (echoBrain) => set({ echoBrain }),
      setCanvas: (canvas) => set({ canvas }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    }),
    {
      name: 'echo-settings',
      version: 2,
      partialize: ({ quality, theme, downloadFormat, crossfade, crossfadeSeconds, extensions, preferExtension, echoBrain, canvas }) => ({ quality, theme, downloadFormat, crossfade, crossfadeSeconds, extensions, preferExtension, echoBrain, canvas }),
      // v0 defaulted downloads to .opus; MP3 320 is the default from v1 on.
      migrate: (state, version) => {
        let s = { ...(state as Settings) };
        if (version < 1) s = { ...s, downloadFormat: 'mp3' };
        if (version < 2) {
          // Add the built-in extensions (keep any the user already added).
          const have = new Set((s.extensions ?? []).map((e) => e.base));
          s = { ...s, extensions: [...DEFAULT_EXTENSIONS.filter((e) => !have.has(e.base)), ...(s.extensions ?? [])], preferExtension: s.preferExtension ?? true };
        }
        return s;
      },
    },
  ),
);
