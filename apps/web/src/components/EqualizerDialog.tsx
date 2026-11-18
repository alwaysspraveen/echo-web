import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Knob } from '@/components/ui/knob';
import { BAND_LIMIT_DB, BANDS, PRESETS, useEq } from '@/player/equalizer';
import { usePlayer } from '@/player/store';
import { cn } from '@/lib/utils';

const hz = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`);
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function EqualizerDialog() {
  const s = useEq();
  const volume = usePlayer((p) => p.volume);
  const setVolume = usePlayer((p) => p.setVolume);
  const setBand = (i: number, v: number) => s.set({ bands: s.bands.map((b, j) => (j === i ? v : b)), preset: null });

  return (
    <Dialog open={s.open} onOpenChange={(open) => s.set({ open })}>
      <DialogContent className="scrollbar-thin max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <div className="flex items-center justify-between gap-4 pr-8">
          <DialogTitle className="font-display text-2xl font-extrabold tracking-tight">Equalizer</DialogTitle>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
            {s.enabled ? 'On' : 'Off'}
            <Switch checked={s.enabled} onCheckedChange={(enabled) => s.set({ enabled })} aria-label="Equalizer on" />
          </label>
        </div>
        <DialogDescription className="sr-only">Volume boost, volume, bass, treble, presets and 10-band equalizer</DialogDescription>

        {/* Common to both tabs. */}
        <section className="flex items-center gap-5 rounded-2xl bg-glass p-4">
          <Knob label="Volume boost" value={s.boost} min={1} max={2} step={0.05} defaultValue={1} format={pct} onChange={(boost) => s.set({ boost })} size={84} />
          <p className="text-sm text-text-muted">
            Louder than 100%, up to 200%. A limiter keeps loud parts from distorting. Works even with the equalizer off.
          </p>
        </section>

        <Tabs defaultValue="basic">
          <TabsList className="bg-glass">
            <TabsTrigger value="basic" className="px-5">Basic</TabsTrigger>
            <TabsTrigger value="advanced" className="px-5">Advanced</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="mt-4">
            <div className="grid grid-cols-3 place-items-center gap-4 rounded-2xl bg-glass px-4 py-6">
              <Knob label="Volume" value={volume} min={0} max={1} step={0.01} defaultValue={0.8} format={pct} onChange={setVolume} size={96} />
              <Knob label="Bass" value={s.bass} min={-BAND_LIMIT_DB} max={BAND_LIMIT_DB} step={0.5} defaultValue={0} format={db} onChange={(bass) => s.set({ bass })} bipolar size={96} disabled={!s.enabled} />
              <Knob label="Treble" value={s.treble} min={-BAND_LIMIT_DB} max={BAND_LIMIT_DB} step={0.5} defaultValue={0} format={db} onChange={(treble) => s.set({ treble })} bipolar size={96} disabled={!s.enabled} />
            </div>
            {!s.enabled && <p className="mt-2 text-center text-xs text-text-faint">Turn the equalizer on to use Bass and Treble.</p>}
          </TabsContent>

          <TabsContent value="advanced" className={cn('mt-4 grid gap-4', !s.enabled && 'opacity-60')}>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text-muted">Presets</h3>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    disabled={!s.enabled}
                    onClick={() => s.set({ preset: p.id, bands: p.bands })}
                    aria-pressed={s.preset === p.id}
                    className={cn('h-8 rounded-full px-3 text-sm font-medium disabled:cursor-not-allowed', s.preset === p.id ? 'bg-seed text-white' : 'bg-glass hover:bg-surface-high')}
                  >
                    {p.name}
                  </button>
                ))}
                {s.preset === null && <span className="flex h-8 items-center rounded-full bg-surface-high px-3 text-sm">Custom</span>}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-muted">10-band equalizer</h3>
                <button disabled={!s.enabled} onClick={() => s.set({ preset: 'flat', bands: PRESETS[0].bands, bass: 0, treble: 0 })} className="rounded-full px-3 py-1 text-sm text-text-muted hover:bg-accent disabled:pointer-events-none">Reset</button>
              </div>
              <div className="grid grid-cols-5 place-items-center gap-y-4 rounded-2xl bg-glass px-2 py-4">
                {BANDS.map((f, i) => (
                  <Knob key={f} label={`${hz(f)} Hz`} value={s.bands[i]} min={-BAND_LIMIT_DB} max={BAND_LIMIT_DB} step={0.5} defaultValue={0} format={db} onChange={(v) => setBand(i, v)} bipolar size={58} disabled={!s.enabled} />
                ))}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
