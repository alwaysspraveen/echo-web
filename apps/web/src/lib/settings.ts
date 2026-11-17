import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'high' | 'normal' | 'low';

export const QUALITY_OPTIONS: { id: Quality; name: string; detail: string }[] = [
  { id: 'high', name: 'High', detail: 'Opus, about 160 kbps. Best sound YouTube Music offers without Premium.' },
  { id: 'normal', name: 'Normal', detail: 'AAC, about 128 kbps. Widest compatibility.' },
  { id: 'low', name: 'Data saver', detail: 'Opus, about 70 kbps. Uses roughly half the data.' },
];

export type DownloadFormat = 'opus' | 'm4a';

export const DOWNLOAD_OPTIONS: { id: DownloadFormat; name: string; detail: string }[] = [
  { id: 'opus', name: 'Best quality (.opus)', detail: 'Opus, about 160 kbps, untouched from YouTube. Plays in VLC, browsers, Android and most players, but not Apple Music.' },
  { id: 'm4a', name: 'Most compatible (.m4a)', detail: 'AAC, about 128 kbps. Plays everywhere, including Apple Music and QuickTime.' },
];

/** 'artwork' follows the playing song's cover; anything else is a preset id from theme.ts. */
export type ThemeChoice = 'artwork' | string;

interface Settings {
  quality: Quality;
  theme: ThemeChoice;
  downloadFormat: DownloadFormat;
  settingsOpen: boolean;
  setQuality: (q: Quality) => void;
  setTheme: (t: ThemeChoice) => void;
  setDownloadFormat: (f: DownloadFormat) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      quality: 'high',
      theme: 'artwork',
      downloadFormat: 'opus',
      settingsOpen: false,
      setQuality: (quality) => set({ quality }),
      setTheme: (theme) => set({ theme }),
      setDownloadFormat: (downloadFormat) => set({ downloadFormat }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    }),
    { name: 'echo-settings', partialize: ({ quality, theme, downloadFormat }) => ({ quality, theme, downloadFormat }) },
  ),
);
