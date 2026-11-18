import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BAND_LIMIT_DB, BANDS, PRESETS, useEq } from '@/player/equalizer';
import { cn } from '@/lib/utils';

const label = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);
const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

function Row({ name, value, min, max, step, format, onChange, disabled }: {
  name: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <label className={cn('grid grid-cols-[7rem_1fr_4.5rem] items-center gap-3 text-sm', disabled && 'opacity-50')}>
      <span className="whitespace-nowrap font-semibold">{name}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--seed)]" aria-label={name} />
      <span className="text-right tabular-nums text-text-muted">{format(value)}</span>
    </label>
  );
}

export function EqualizerDialog() {
  const s = useEq();
  const setBand = (i: number, v: number) => s.set({ bands: s.bands.map((b, j) => (j === i ? v : b)), preset: null });
  return (
    <Dialog open={s.open} onOpenChange={(open) => s.set({ open })}>
      <DialogContent className="scrollbar-thin max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <div className="flex items-center justify-between gap-4 pr-8">
          <DialogTitle className="font-display text-2xl font-extrabold tracking-tight">Equalizer</DialogTitle>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            {s.enabled ? 'On' : 'Off'}
            <input type="checkbox" className="size-5 accent-[var(--seed)]" checked={s.enabled} onChange={(e) => s.set({ enabled: e.target.checked })} aria-label="Equalizer on" />
          </label>
        </div>
        <DialogDescription className="sr-only">Bass, treble, volume boost, presets and 10-band equalizer</DialogDescription>

        <section className="grid gap-3 rounded-2xl bg-glass p-4">
          <Row name="Bass" value={s.bass} min={-BAND_LIMIT_DB} max={BAND_LIMIT_DB} step={0.5} format={db} disabled={!s.enabled} onChange={(v) => s.set({ bass: v })} />
          <Row name="Treble" value={s.treble} min={-BAND_LIMIT_DB} max={BAND_LIMIT_DB} step={0.5} format={db} disabled={!s.enabled} onChange={(v) => s.set({ treble: v })} />
          <Row name="Volume boost" value={s.boost} min={1} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.set({ boost: v })} />
          <p className="text-xs text-text-faint">Volume boost works even with the equalizer off. A limiter keeps loud parts from distorting.</p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-muted">Presets</h3>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                disabled={!s.enabled}
                onClick={() => s.set({ preset: p.id, bands: p.bands })}
                aria-pressed={s.preset === p.id}
                className={cn('h-8 rounded-full px-3 text-sm font-medium disabled:opacity-50', s.preset === p.id ? 'bg-seed text-white' : 'bg-glass hover:bg-surface-high')}
              >
                {p.name}
              </button>
            ))}
            {s.preset === null && <span className="flex h-8 items-center rounded-full bg-surface-high px-3 text-sm">Custom</span>}
          </div>
        </section>

        <section className={cn(!s.enabled && 'opacity-50')}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-muted">10-band equalizer</h3>
            <button disabled={!s.enabled} onClick={() => s.set({ preset: 'flat', bands: PRESETS[0].bands, bass: 0, treble: 0 })} className="rounded-full px-3 py-1 text-sm text-text-muted hover:bg-accent disabled:pointer-events-none">Reset</button>
          </div>
          <div className="grid grid-cols-10 gap-1 rounded-2xl bg-glass p-3">
            {BANDS.map((hz, i) => (
              <label key={hz} className="flex flex-col items-center gap-2">
                <span className="text-[10px] tabular-nums text-text-muted">{s.bands[i] > 0 ? '+' : ''}{s.bands[i].toFixed(1)}</span>
                <input
                  type="range"
                  min={-BAND_LIMIT_DB}
                  max={BAND_LIMIT_DB}
                  step={0.5}
                  value={s.bands[i]}
                  disabled={!s.enabled}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                  aria-label={`${label(hz)}Hz`}
                  className="h-36 accent-[var(--seed)] [writing-mode:vertical-lr] [direction:rtl]"
                />
                <span className="text-[11px] font-semibold tabular-nums">{label(hz)}</span>
              </label>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
