import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DOWNLOAD_OPTIONS, QUALITY_OPTIONS, useSettings } from '@/lib/settings';
import { PRESETS } from '@/lib/theme';
import { DEFAULT_LT_SERVER, useLt } from '@/lib/listenTogether';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useEq } from '@/player/equalizer';
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

        <AppUpdates />

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Canvas</h3>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
            <span>
              <span className="block font-semibold">Show canvas</span>
              <span className="block text-sm text-text-muted">Animated album artwork in Now Playing, when the album has one.</span>
            </span>
            <Switch checked={s.canvas} onCheckedChange={s.setCanvas} aria-label="Show canvas" />
          </label>
        </section>

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Echo Brain (Beta)</h3>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
            <span>
              <span className="block font-semibold">Enable Echo Brain</span>
              <span className="block text-sm text-text-muted">Automatically add AI recommendations based on your listening habits.</span>
            </span>
            <Switch checked={s.echoBrain} onCheckedChange={s.setEchoBrain} aria-label="Enable Echo Brain" />
          </label>
        </section>

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Extensions</h3>
          <p className="mb-3 text-sm text-text-muted">Stream 320 kbps or lossless audio from an Echo extension server (for example the 320kbs-extension or lossless-extension). Songs it doesn't have play from YouTube Music as usual.</p>
          <ExtensionsField />
        </section>

        <SpatialAudioField />

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Crossfade</h3>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
            <span>
              <span className="block font-semibold">Crossfade between songs</span>
              <span className="block text-sm text-text-muted">The end of a song blends into the start of the next.</span>
            </span>
            <Switch checked={s.crossfade} onCheckedChange={s.setCrossfade} aria-label="Crossfade between songs" />
          </label>
          {s.crossfade && (
            <label className="mt-3 flex items-center gap-3 px-1 text-sm">
              <span className="w-16 text-text-muted">Duration</span>
              <input type="range" min={1} max={12} step={1} value={s.crossfadeSeconds} onChange={(e) => s.setCrossfadeSeconds(Number(e.target.value))} className="flex-1 accent-[var(--seed)]" aria-label="Crossfade duration in seconds" />
              <span className="w-10 text-right tabular-nums">{s.crossfadeSeconds} s</span>
            </label>
          )}
        </section>

        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Download format</h3>
          <p className="mb-3 text-sm text-text-muted">Every download includes the title, artist, album and cover art.</p>
          <Choice label="Download format" value={s.downloadFormat} options={DOWNLOAD_OPTIONS} onChange={s.setDownloadFormat} />
        </section>
        <section className="mt-2">
          <h3 className="mb-1 font-display text-lg font-bold">Listen Together server</h3>
          <p className="mb-3 text-sm text-text-muted">The same server Echo for Android uses, so phones and laptops can share rooms. It never carries audio.</p>
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
  const { server, setServer } = useLt();
  return (
    <div className="flex gap-2">
      <Input defaultValue={server} key={server} onBlur={(e) => setServer(e.target.value)} aria-label="Listen Together server URL" spellCheck={false} />
      {server !== DEFAULT_LT_SERVER && <button onClick={() => setServer(DEFAULT_LT_SERVER)} className="shrink-0 rounded-full px-3 text-sm text-text-muted hover:bg-accent">Reset</button>}
    </div>
  );
}

function ExtensionsField() {
  const { extensions, setExtensions, preferExtension, setPreferExtension } = useSettings();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/extension/manifest?base=${encodeURIComponent(url)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not add this extension');
      if (extensions.some((x) => x.base === body.base)) throw new Error('Already added');
      setExtensions([...extensions, { base: body.base, name: body.name, enabled: true }]);
      setUrl('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2">
      {extensions.map((x) => (
        <div key={x.base} className="flex items-center gap-3 rounded-2xl bg-glass p-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{x.name}</span>
            <span className="block truncate text-xs text-text-muted">{x.base}</span>
          </span>
          <Switch aria-label={`Use ${x.name}`} checked={x.enabled} onCheckedChange={(on) => setExtensions(extensions.map((y) => (y.base === x.base ? { ...y, enabled: on } : y)))} />
          <button onClick={() => setExtensions(extensions.filter((y) => y.base !== x.base))} className="rounded-full px-2 text-sm text-text-muted hover:text-destructive" aria-label={`Remove ${x.name}`}>Remove</button>
        </div>
      ))}
      <form onSubmit={add} className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Extension server address (https://…)" aria-label="Extension server address" spellCheck={false} />
        <button type="submit" disabled={busy || !url.trim()} className="shrink-0 rounded-full bg-glass px-4 text-sm font-semibold hover:bg-surface-high disabled:opacity-50">{busy ? 'Checking…' : 'Add'}</button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {extensions.length > 0 && (
        <label className="mt-1 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
          <span>
            <span className="block font-semibold">Prefer extension audio</span>
            <span className="block text-sm text-text-muted">Look for each song on your extensions first.</span>
          </span>
          <Switch checked={preferExtension} onCheckedChange={setPreferExtension} aria-label="Prefer extension audio" />
        </label>
      )}
    </div>
  );
}

declare global {
  interface Window { echoDesktop?: { version: () => Promise<string>; checkForUpdates: () => Promise<void> } }
}

/** Desktop app only: current version and a "Check for updates" button. */
function AppUpdates() {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { window.echoDesktop?.version().then(setVersion).catch(() => {}); }, []);
  if (!window.echoDesktop) return null;
  const check = async () => {
    setChecking(true);
    try { await window.echoDesktop!.checkForUpdates(); } finally { setChecking(false); }
  };
  return (
    <section className="mt-2">
      <h3 className="mb-1 font-display text-lg font-bold">App updates</h3>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
        <span>
          <span className="block font-semibold">Echo Music {version ?? ''}</span>
          <span className="block text-sm text-text-muted">Updates are checked automatically when Echo opens and every 6 hours.</span>
        </span>
        <button onClick={check} disabled={checking} className="shrink-0 rounded-full bg-seed px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
    </section>
  );
}

function SpatialAudioField() {
  const spatial = useEq((s) => s.spatial);
  return (
    <section className="mt-2">
      <h3 className="mb-1 font-display text-lg font-bold">Spatial audio</h3>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
        <span>
          <span className="block font-semibold">Enable spatial audio</span>
          <span className="block text-sm text-text-muted">Wider, more open sound that seems to come from around you. Best with headphones.</span>
        </span>
        <Switch checked={spatial} onCheckedChange={(on) => useEq.getState().set({ spatial: on })} aria-label="Enable spatial audio" />
      </label>
    </section>
  );
}
