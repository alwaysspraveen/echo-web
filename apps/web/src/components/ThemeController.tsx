import { useEffect, useState } from 'react';
import { artUrl } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { applyTheme, DEFAULT_SEED, PRESETS, vibrantColor } from '@/lib/theme';
import { useCurrentTrack } from '@/player/store';

const seedCache = new Map<string, string | null>();

/** Reads the most vivid color of an artwork image (via the same-origin /api/art copy). */
function useArtworkSeed(thumbnail: string | undefined, enabled: boolean) {
  const [seed, setSeed] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !thumbnail) return;
    if (seedCache.has(thumbnail)) { setSeed(seedCache.get(thumbnail)!); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 48;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 48, 48);
      const color = vibrantColor(ctx.getImageData(0, 0, 48, 48).data);
      seedCache.set(thumbnail, color);
      if (!cancelled) setSeed(color);
    };
    img.onerror = () => !cancelled && setSeed(null);
    img.src = artUrl(thumbnail);
    return () => { cancelled = true; };
  }, [thumbnail, enabled]);
  return enabled ? seed : null;
}

/** Applies the chosen theme (a preset, or the current song's artwork color). Renders nothing. */
export function ThemeController() {
  const theme = useSettings((s) => s.theme);
  const track = useCurrentTrack();
  const artworkSeed = useArtworkSeed(track?.thumbnail, theme === 'artwork');
  const seed = theme === 'artwork' ? artworkSeed ?? DEFAULT_SEED : PRESETS.find((p) => p.id === theme)?.seed ?? DEFAULT_SEED;
  useEffect(() => applyTheme(seed), [seed]);
  return null;
}
