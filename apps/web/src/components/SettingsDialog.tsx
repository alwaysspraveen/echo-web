import { Check, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DOWNLOAD_OPTIONS, QUALITY_OPTIONS, useSettings } from '@/lib/settings';
import { PRESETS } from '@/lib/theme';
import { DEFAULT_JAM_SERVER, useJam } from '@/lib/jam';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function Choice<T extends string>({ value, options, onChange, label }: {
  value: T; label: string; onChange: (v: T) => void; options: { id: T; name: string; detail: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-start gap-3 rounded-2xl p-3.5 text-left ring-1 ring-transparent hover:bg-accent',
            value === o.id ? 'bg-glass ring-seed/60' : 'bg-transparent',
          )}
        >
          <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', value === o.id ? 'border-seed bg-seed text-white' : 'border-text-faint')}>
            {value === o.id && <Check className="size-3" strokeWidth={3} />}
          </span>
          <span>
            <span className="block font-semibold">{o.name}</span>
            <span className="mt-0.5 block text-sm text-text-muted">{o.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function SettingsDialog() {
  const s = useSettings();
  return (
    <Dialog open={s.settingsOpen} onOpenChange={s.setSettingsOpen}>
      <DialogContent className="scrollbar-thin max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogTitle className="font-display text-2xl font-extrabold tracking-tight">Settings</DialogTitle>
        <DialogDescription className="sr-only">Theme, streaming quality and download format</DialogDescription>

        <section>
          <h3 className="mb-1 font-display text-lg font-bold">Theme</h3>
          <p className="mb-3 text-sm text-text-muted">The accent color and the tint of every surface.</p>
          <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-3">
            <Swatch
              label="Match artwork"
              selected={s.theme === 'artwork'}
              onClick={() => s.setTheme('artwork')}
              style={{ background: 'conic-gradient(from 200deg, #ED5564, #F0A43A, #9ACD4E, #2BB3A3, #4C9EEB, #9B7BF2, #E86AB4, #ED5564)' }}
              icon={<Sparkles className="size-4 text-white drop-shadow" />}
            />
            {PRESETS.map((p) => (
              <Swatch key={p.id} label={p.name} selected={s.theme === p.id} onClick={() => s.setTheme(p.id)} style={{ background: p.seed }} />
            ))}
          </div>
          <p className="mt-2 text-sm text-text-faint">
            {s.theme === 'artwork' ? 'Colors follow the cover of the song that is playing.' : PRESETS.find((p) => p.id === s.theme)?.name}
          </p>
        </section>

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Streaming quality</h3>
          <p className="mb-3 text-sm text-text-muted">Changing it mid-song continues from the same spot.</p>
          <Choice label="Streaming quality" value={s.quality} options={QUALITY_OPTIONS} onChange={s.setQuality} />
        </section>

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Download format</h3>
          <p className="mb-3 text-sm text-text-muted">Every download includes the title, artist, album and cover art.</p>
          <Choice label="Download format" value={s.downloadFormat} options={DOWNLOAD_OPTIONS} onChange={s.setDownloadFormat} />
        </section>
        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Jam server</h3>
          <p className="mb-3 text-sm text-text-muted">Coordinates Jams between devices. It never carries audio. Change it only if you host your own.</p>
          <JamServerField />
        </section>
      </DialogContent>
    </Dialog>
  );
}

function Swatch({ label, selected, onClick, style, icon }: { label: string; selected: boolean; onClick: () => void; style: React.CSSProperties; icon?: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn('grid size-11 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface', selected ? 'ring-text' : 'ring-transparent hover:ring-text-faint')}
      style={style}
    >
      {selected && !icon ? <Check className="size-4 text-white drop-shadow" strokeWidth={3} /> : icon}
    </button>
  );
}

function JamServerField() {
  const { server, setServer } = useJam();
  return (
    <div className="flex gap-2">
      <Input defaultValue={server} key={server} onBlur={(e) => setServer(e.target.value)} aria-label="Jam server URL" spellCheck={false} />
      {server !== DEFAULT_JAM_SERVER && <button onClick={() => setServer(DEFAULT_JAM_SERVER)} className="shrink-0 rounded-full px-3 text-sm text-text-muted hover:bg-accent">Reset</button>}
    </div>
  );
}
