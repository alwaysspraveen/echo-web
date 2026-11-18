// Generates Echo's dark palette from one seed color, the way the Android app derives its
// Material scheme from a seed (default #ED5564). Applied as CSS variables on <html>.

export interface ThemePreset {
  id: string;
  name: string;
  seed: string;
}

export const DEFAULT_SEED = '#ED5564';

export const PRESETS: ThemePreset[] = [
  { id: 'echo', name: 'Echo red', seed: DEFAULT_SEED },
  { id: 'amber', name: 'Amber', seed: '#F0A43A' },
  { id: 'lime', name: 'Lime', seed: '#9ACD4E' },
  { id: 'teal', name: 'Teal', seed: '#2BB3A3' },
  { id: 'sky', name: 'Sky', seed: '#4C9EEB' },
  { id: 'violet', name: 'Violet', seed: '#9B7BF2' },
  { id: 'pink', name: 'Pink', seed: '#E86AB4' },
  { id: 'mono', name: 'Mono', seed: '#9E9E9E' },
];

type Hsl = [number, number, number]; // h 0-360, s 0-100, l 0-100

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return rgbToHsl(r * 255, g * 255, b * 255);
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

const hsl = (h: number, s: number, l: number, a?: number) =>
  `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%${a != null ? ` / ${a}` : ''})`;

/** The CSS variables for a dark theme built around `seed`. */
export function paletteFromSeed(seed: string): Record<string, string> {
  const [h, s0, l0] = hexToHsl(seed);
  const chroma = Math.min(s0, 100) / 100; // 0 for grey seeds → neutral palette
  const tint = (amount: number) => amount * chroma;
  // Keep the accent readable on dark surfaces.
  const accentL = Math.min(Math.max(l0, 52), 68);
  return {
    '--bg': hsl(h, tint(19), 8),
    '--surface': hsl(h, tint(15), 11.5),
    '--surface-high': hsl(h, tint(12), 16.5),
    '--card-glass': hsl(h, tint(10), 29, 0.3),
    '--text': hsl(h, tint(40), 93),
    '--text-muted': hsl(h, tint(14), 80),
    '--text-faint': hsl(h, tint(8), 59),
    '--seed': hsl(h, Math.max(s0, chroma ? 55 : 0), accentL),
    '--seed-soft': hsl(h, chroma ? 100 : 0, 85),
    '--primary-container': hsl(h, chroma ? 65 : 0, 30),
    '--on-primary-container': hsl(h, chroma ? 100 : 0, 93),
    '--line': hsl(h, tint(40), 93, 0.1),
  };
}

export function applyTheme(seed: string) {
  const root = document.documentElement;
  const vars = paletteFromSeed(seed);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--bg']);
}

/**
 * Picks the most vivid color from an image: a hue histogram weighted by saturation, ignoring
 * near-black, near-white and grey pixels. Returns a hex color, or null for colorless artwork.
 */
export function vibrantColor(pixels: Uint8ClampedArray): string | null {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 200) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 25 || l < 18 || l > 85) continue;
    const w = (s / 100) * (1 - Math.abs(l - 50) / 50);
    const bin = bins[Math.floor(h / 15) % 24];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < 2) return null;
  const hex = (v: number) => Math.round(v / best.w).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
