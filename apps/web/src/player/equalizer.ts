// Equalizer + volume boost, presets and loudness boost.
// Web Audio graph: player → 10 peaking filters → spatial stage → boost gain → limiter → speakers.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { audio, fader } from './audio';

/** 10 bands, 31 Hz to 16 kHz. */
export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const BAND_LIMIT_DB = 12;

// Preset levels in millibels (150 = 1.5 dB), converted to dB.
const mb = (...v: number[]) => v.map((x) => x / 100);
export const PRESETS: { id: string; name: string; bands: number[] }[] = [
  { id: 'flat', name: 'Flat', bands: mb(0, 0, 0, 0, 0, 0, 0, 0, 0, 0) },
  { id: 'echo', name: 'Resona Signature', bands: mb(150, 100, 50, 0, -20, 0, 80, 150, 200, 150) },
  { id: 'acoustic', name: 'Acoustic', bands: mb(150, 150, 50, 75, 100, 75, 125, 175, 150, 75) },
  { id: 'bass', name: 'Bass Boost', bands: mb(500, 400, 250, 100, 0, -50, 0, 100, 200, 300) },
  { id: 'clarity', name: 'Pure Clarity', bands: mb(-100, -50, 0, 50, 150, 250, 300, 250, 150, 100) },
  { id: 'softbass', name: 'Soft Bass', bands: mb(200, 180, 140, 80, 30, 20, 60, 90, 110, 130) },
  { id: 'electronic', name: 'Electronic', bands: mb(350, 280, 120, -50, -150, 50, 180, 300, 400, 500) },
  { id: 'rock', name: 'Rock', bands: mb(300, 220, 150, 50, -100, 120, 200, 250, 320, 380) },
  { id: 'pop', name: 'Pop', bands: mb(-150, 0, 100, 180, 250, 220, 150, 80, -50, -120) },
  { id: 'jazz', name: 'Jazz', bands: mb(150, 100, 60, 140, 200, 180, 120, 180, 220, 200) },
  { id: 'voice', name: 'Voice', bands: mb(-250, -150, 0, 200, 400, 380, 200, 120, 0, -120) },
  { id: 'dolby-open', name: 'Dolby Open', bands: mb(150, 180, 220, 180, 160, 210, 250, 280, 180, 80) },
  { id: 'dolby-rich', name: 'Dolby Rich', bands: mb(100, 160, 200, 220, 280, 260, 240, 200, 150, 50) },
  { id: 'dolby-focused', name: 'Dolby Focused', bands: mb(-300, -50, 130, 180, 220, 120, 140, 100, -50, -300) },
  { id: 'dirac-music', name: 'Dirac Music', bands: mb(200, 140, 80, 0, 30, 80, 140, 200, 280, 350) },
  { id: 'dirac-movie', name: 'Dirac Movie', bands: mb(300, 250, 150, 0, 70, 120, 180, 250, 320, 400) },
  { id: 'dirac-game', name: 'Dirac Game', bands: mb(150, 250, 200, 0, 80, 150, 300, 450, 400, 280) },
];

// How much the Bass / Treble sliders move each band.
const BASS_WEIGHT = [1, 1, 0.75, 0.4, 0.1, 0, 0, 0, 0, 0];
const TREBLE_WEIGHT = [0, 0, 0, 0, 0, 0.1, 0.3, 0.7, 1, 1];

interface EqState {
  enabled: boolean;
  preset: string | null; // null = custom
  bands: number[]; // dB per band
  bass: number; // dB, -12..12
  treble: number; // dB, -12..12
  boost: number; // 1 = 100%, up to 2 = 200%
  spatial: boolean; // headphone spatial audio (wider stage, virtual speakers, a little room)
  open: boolean;
  set: (p: Partial<Omit<EqState, 'set'>>) => void;
}

export const useEq = create<EqState>()(
  persist(
    (set) => ({ enabled: false, preset: 'flat', bands: PRESETS[0].bands, bass: 0, treble: 0, boost: 1, spatial: false, open: false, set: (p) => set(p) }),
    { name: 'echo-eq', partialize: ({ open: _o, set: _s, ...rest }) => rest },
  ),
);

/** Final gain per band: band level + Bass/Treble contribution, clamped. */
export function bandGains(s: Pick<EqState, 'bands' | 'bass' | 'treble'>) {
  return BANDS.map((_, i) => Math.max(-BAND_LIMIT_DB * 1.5, Math.min(BAND_LIMIT_DB * 1.5, s.bands[i] + s.bass * BASS_WEIGHT[i] + s.treble * TREBLE_WEIGHT[i])));
}

let ctx: AudioContext | null = null;
let filters: BiquadFilterNode[] = [];
let boost: GainNode | null = null;
let spatial: SpatialStage | null = null;

interface SpatialStage { direct: GainNode; side: GainNode; virtual: GainNode; room: GainNode }

/** Short, dark, decaying-noise impulse response: a small room, not a cathedral. */
function roomImpulse(c: AudioContext, seconds = 1.6) {
  const len = Math.floor(c.sampleRate * seconds);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.35 * (Math.random() * 2 - 1 - lp); // soften the highs
      d[i] = lp * Math.pow(1 - i / len, 3.2);
    }
  }
  return ir;
}

/**
 * Spatial audio for headphones. Three layers mixed together:
 * - direct: the stereo signal, with the side (L−R) part raised to widen the stage;
 * - virtual: left and right played through HRTF "speakers" in front at ±35°, so the sound
 *   sits outside your head instead of between your ears;
 * - room: a little reverb for depth.
 * Off = direct only with no widening, i.e. the untouched signal.
 */
function buildSpatial(c: AudioContext, input: AudioNode, output: AudioNode): SpatialStage {
  const split = c.createChannelSplitter(2);
  const merge = c.createChannelMerger(2);
  input.connect(split);
  // Widening: L' = L + k(L−R), R' = R + k(R−L). `side` holds k (0 = untouched).
  const side = c.createGain();
  side.gain.value = 0;
  const diff = c.createGain(); // L−R
  const inv = c.createGain();
  inv.gain.value = -1;
  split.connect(diff, 0);
  split.connect(inv, 1).connect(diff);
  diff.connect(side);
  const sideInv = c.createGain();
  sideInv.gain.value = -1;
  side.connect(sideInv);
  split.connect(merge, 0, 0);
  split.connect(merge, 1, 1);
  side.connect(merge, 0, 0);
  sideInv.connect(merge, 0, 1);
  const direct = c.createGain();
  merge.connect(direct).connect(output);

  const virtual = c.createGain();
  virtual.gain.value = 0;
  const vsplit = c.createChannelSplitter(2);
  merge.connect(vsplit);
  ([[0, -35], [1, 35]] as const).forEach(([ch, deg]) => {
    const p = c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'linear';
    p.refDistance = 1;
    p.maxDistance = 10;
    p.rolloffFactor = 0;
    const a = (deg * Math.PI) / 180;
    p.positionX.value = Math.sin(a);
    p.positionZ.value = -Math.cos(a);
    vsplit.connect(p, ch).connect(virtual);
  });
  virtual.connect(output);

  const room = c.createGain();
  room.gain.value = 0;
  const conv = c.createConvolver();
  conv.buffer = roomImpulse(c);
  merge.connect(conv).connect(room).connect(output);
  return { direct, side, virtual, room };
}
const connected = new WeakSet<HTMLMediaElement>();

/** Builds the graph once (only after the user turns the EQ or boost on; until then audio is untouched). */
function ensureGraph() {
  if (ctx) return;
  ctx = new AudioContext({ latencyHint: 'playback' });
  filters = BANDS.map((f, i) => {
    const b = ctx!.createBiquadFilter();
    b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
    b.frequency.value = f;
    b.Q.value = 1.1;
    return b;
  });
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  boost = ctx.createGain();
  spatial = buildSpatial(ctx, filters[filters.length - 1], boost);
  // Limiter: lets the boost raise quiet parts without hard clipping on loud ones.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  boost.connect(limiter).connect(ctx.destination);
  route(audio);
  route(fader); // crossfade tail player
  // The context can start suspended (autoplay rules); wake it whenever playback starts.
  audio.addEventListener('play', () => { ctx?.resume().catch(() => {}); });
  ctx.resume().catch(() => {});
}

/** Sends a media element (the player, or the crossfade tail player) through the equalizer. */
export function route(el: HTMLMediaElement | null) {
  if (!ctx || !el || connected.has(el)) return;
  connected.add(el);
  ctx.createMediaElementSource(el).connect(filters[0]);
}
export const eqActive = () => ctx !== null;

function apply() {
  const s = useEq.getState();
  const on = s.enabled || s.boost !== 1 || s.spatial;
  if (!on && !ctx) return; // never touch the audio until the user uses it
  ensureGraph();
  const gains = s.enabled ? bandGains(s) : BANDS.map(() => 0);
  const t = ctx!.currentTime;
  filters.forEach((f, i) => f.gain.setTargetAtTime(gains[i], t, 0.05));
  boost!.gain.setTargetAtTime(s.boost, t, 0.05);
  // Spatial mix; levels chosen so switching it on doesn't jump in loudness.
  const sp = s.spatial;
  spatial!.side.gain.setTargetAtTime(sp ? 0.3 : 0, t, 0.08);
  spatial!.direct.gain.setTargetAtTime(sp ? 0.55 : 1, t, 0.08);
  spatial!.virtual.gain.setTargetAtTime(sp ? 0.75 : 0, t, 0.08);
  spatial!.room.gain.setTargetAtTime(sp ? 0.18 : 0, t, 0.08);
}

/** Start applying settings (call once at startup). */
export function initEqualizer() {
  apply();
  useEq.subscribe(apply);
}
