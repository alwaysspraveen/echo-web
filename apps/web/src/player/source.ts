import { create } from 'zustand';

/**
 * Where the current song's audio comes from, shown as a badge ("LOSSLESS", "320KBPS · AAC"), plus
 * the real bit depth / sample rate when the server read them from the FLAC file.
 */
interface NowSource { label: string | null; bitDepth?: number; sampleRate?: number }
export const useNowSource = create<NowSource>(() => ({ label: null }));

/** Sets the badge (clears any previous bit depth / sample rate). */
export const setSource = (s: NowSource) => useNowSource.setState({ bitDepth: undefined, sampleRate: undefined, ...s }, true);

interface StreamInfo { format?: string; quality?: string; streamQuality?: string; audioQuality?: string; codec?: string | null; bitDepth?: number; sampleRate?: number }
/** Badge for an extension stream. */
export function sourceFromStream(ext: StreamInfo): NowSource {
  const lossless = /flac|lossless|hi_?res/i.test([ext.format, ext.codec, ext.quality, ext.audioQuality].join(' '));
  if (lossless) return { label: 'LOSSLESS · FLAC', bitDepth: ext.bitDepth, sampleRate: ext.sampleRate };
  return { label: [ext.quality || ext.streamQuality || ext.audioQuality, ext.codec || ext.format].filter(Boolean).join(' · ').toUpperCase() || 'EXTENSION' };
}

/** Hi-Res: better than CD quality (24-bit or more, or above 48 kHz). */
export const isHiRes = (s: Pick<NowSource, 'bitDepth' | 'sampleRate'>) => (s.bitDepth ?? 0) >= 24 || (s.sampleRate ?? 0) > 48000;
export const formatDetail = (s: Pick<NowSource, 'bitDepth' | 'sampleRate'>) =>
  s.bitDepth && s.sampleRate ? `${s.bitDepth}-bit · ${+(s.sampleRate / 1000).toFixed(1)} kHz` : null;
