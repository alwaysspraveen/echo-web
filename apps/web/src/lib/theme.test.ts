import { describe, expect, it } from 'vitest';
import { hexToHsl, paletteFromSeed, vibrantColor } from './theme';

const px = (...rgb: [number, number, number][]) => new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255]));

describe('theme', () => {
  it('reads the default seed hue', () => {
    const [h, s] = hexToHsl('#ED5564');
    expect(Math.round(h)).toBe(354);
    expect(s).toBeGreaterThan(70);
  });
  it('builds a dark palette with a neutral version for grey seeds', () => {
    const p = paletteFromSeed('#ED5564');
    expect(p['--bg']).toMatch(/^hsl\(354\.\d \d+\.\d% 8\.0%\)$/);
    expect(paletteFromSeed('#9E9E9E')['--bg']).toBe('hsl(0.0 0.0% 8.0%)');
  });
  it('picks the dominant vivid color and ignores greys', () => {
    const blue: [number, number, number] = [30, 90, 220];
    const grey: [number, number, number] = [120, 120, 120];
    const pixels = px(...Array(20).fill(blue), ...Array(80).fill(grey), [220, 40, 40]);
    expect(vibrantColor(pixels)).toBe('#1e5adc');
  });
  it('returns null for colorless artwork', () => {
    expect(vibrantColor(px(...Array(50).fill([128, 128, 128] as [number, number, number])))).toBeNull();
  });
});
