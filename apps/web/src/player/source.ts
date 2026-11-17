import { create } from 'zustand';

/** Where the current song's audio comes from, shown as a small badge (e.g. "LOSSLESS · FLAC"). */
export const useNowSource = create<{ label: string | null }>(() => ({ label: null }));
