import { useState } from 'react';
import { Check, Copy, Crown, KeyRound, LogOut, Radio, Users, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { acceptSuggestion, approve, decline, declineSuggestion, joinRoom, leaveRoom, ltIsHost, startRoom, useLt } from '@/lib/listenTogether';
import { useCurrentTrack, usePlayer, useUi } from '@/player/store';
import logo from '@/logo.png';
import { cn, copyText } from '@/lib/utils';

/** Opens the Listen Together panel when in a room, otherwise the Start/Join dialog. */
export function openListenTogether() {
  if (useLt.getState().session) useUi.getState().setPanel('jam');
  else useLt.getState().setDialogOpen(true);
}

export function ListenTogetherDialog() {
  const { dialogOpen, setDialogOpen, status, name: savedName } = useLt();
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const busy = status === 'connecting' || status === 'waiting';

  const done = () => { setDialogOpen(false); setError(''); setCode(''); useUi.getState().setPanel('jam'); };

  const start = async () => {
    setError('');
    try {
      const c = await startRoom(name.trim() || 'Host');
      done();
      toast(`Room started. Share the code ${c}`);
    } catch (e) { setError((e as Error).message); }
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Z0-9]{4,12}$/.test(code.trim())) { setError('Enter the room code from the host.'); return; }
    try {
      await joinRoom(code, name.trim() || 'Guest');
      done();
      toast('You joined the room');
    } catch (e2) { setError((e2 as Error).message); }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => { if (!busy || !o) setDialogOpen(o); if (!o) setError(''); }}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <VibeHero />
        <div className="grid gap-4 px-6 pb-6">
          <div className="text-center">
            <DialogTitle className="font-display text-4xl font-extrabold tracking-tight">Vibe</DialogTitle>
            <DialogDescription className="mt-1 text-base text-text-muted">Same song. Same second. Wherever your friends are.</DialogDescription>
          </div>

          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-text-muted">
            <li className="flex items-center gap-1.5"><Zap className="size-4 text-seed-soft" />In sync to ~50 ms</li>
            <li className="flex items-center gap-1.5"><Crown className="size-4 text-seed-soft" />You're the DJ</li>
            <li className="flex items-center gap-1.5"><KeyRound className="size-4 text-seed-soft" />Just a code, no sign-up</li>
          </ul>

          <label className="grid gap-1.5 text-sm font-medium">
            Your name
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="How friends see you" />
          </label>

          <Button
            size="lg"
            onClick={start}
            disabled={busy}
            className="h-12 rounded-full bg-gradient-to-r from-seed to-[color-mix(in_oklab,var(--seed)_65%,#ff9a62)] text-base font-bold text-white shadow-[0_8px_30px_-6px_var(--seed)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Radio />{status === 'connecting' ? 'Starting…' : 'Start a Vibe'}
          </Button>

          <div className="flex items-center gap-3 text-xs text-text-faint"><span className="h-px flex-1 bg-line" />or join a friend<span className="h-px flex-1 bg-line" /></div>

          <form onSubmit={join} className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
              placeholder="Room code"
              aria-label="Room code"
              className="h-12 text-center font-display text-xl font-bold tracking-[0.35em] uppercase placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:normal-case"
            />
            <Button type="submit" variant="secondary" size="lg" className="h-12 rounded-full px-6" disabled={busy}>Join</Button>
          </form>

          {status === 'waiting' && <p className="flex items-center justify-center gap-2 text-sm text-text-muted"><span className="vibe-live size-2 rounded-full bg-green-400" />Waiting for the host to let you in…</p>}
          {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The Vibe "pulse": your current song spinning at the centre, rings beating outward, friends on the rings. */
function VibeHero() {
  const track = useCurrentTrack();
  const art = track?.thumbnail;
  return (
    <div className="relative grid h-56 place-items-center overflow-hidden" aria-hidden>
      <div className="vibe-glow absolute size-72 rounded-full bg-[radial-gradient(circle,var(--seed)_0%,transparent_65%)] opacity-70 blur-2xl" />
      {[0, 0.8, 1.6].map((d) => (
        <span key={d} className="vibe-ring absolute size-48 rounded-full border-2 border-seed-soft/60" style={{ animationDelay: `${d}s` }} />
      ))}
      {/* Friends orbiting on the rings */}
      <div className="vibe-orbit absolute size-44">
        {[
          { c: 'A', pos: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', bg: 'bg-[#7c5cff]' },
          { c: 'S', pos: 'right-0 top-1/4 translate-x-1/2', bg: 'bg-[#2fb6a0]' },
          { c: 'R', pos: 'bottom-0 left-2/3 translate-y-1/2', bg: 'bg-[#f5a623]' },
        ].map((f) => (
          <span key={f.c} className={cn('vibe-counter absolute grid size-8 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-surface shadow-lg', f.pos, f.bg)}>{f.c}</span>
        ))}
      </div>
      {/* Your song as a spinning disc */}
      <div className="relative size-28 rounded-full shadow-[0_10px_40px_-8px_rgb(0_0_0/0.7)]">
        <div className="vibe-spin size-full overflow-hidden rounded-full ring-4 ring-black/40">
          {art ? <img src={art} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : <div className="grid size-full place-items-center bg-surface-high"><img src={logo} alt="" className="size-14" /></div>}
        </div>
        <span className="absolute inset-0 m-auto size-5 rounded-full bg-surface ring-2 ring-white/20" />
      </div>
    </div>
  );
}

/** Small animated equalizer bars. */
function Equalizer({ className, bars = 5 }: { className?: string; bars?: number }) {
  return (
    <span className={cn('flex items-end gap-[3px]', className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="vibe-bar h-full w-[3px] rounded-full bg-seed-soft" style={{ animationDelay: `${(i * 0.17) % 0.9}s`, animationDuration: `${0.7 + ((i * 37) % 5) / 10}s` }} />
      ))}
    </span>
  );
}

export function ListenTogetherPanel() {
  const { session, status, users, requests, suggestions, hostId } = useLt();
  if (!session) return <p className="px-5 py-6 text-sm text-text-muted">You're not in a room.</p>;
  const host = ltIsHost();
  const copy = () => copyText(session.roomCode).then((ok) => toast(ok ? `Code ${session.roomCode} copied` : `Couldn't copy. The code is ${session.roomCode}`));

  return (
    <div className="px-4 pb-6">
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-seed/70 via-seed/35 to-seed/10 p-5">
        <div className="vibe-glow pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.35)_0%,transparent_65%)]" />
        <p className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <span className={cn('size-2 rounded-full', status === 'live' ? 'vibe-live bg-green-400' : 'bg-amber-300')} />
          {status === 'reconnecting' ? 'Reconnecting…' : status === 'connecting' ? 'Connecting…' : host ? 'Your Vibe is live' : 'Vibing together'}
        </p>
        <button onClick={copy} className="group mt-2 flex items-center gap-2 font-display text-5xl font-extrabold tracking-[0.12em] text-white" aria-label={`Copy room code ${session.roomCode}`}>
          {session.roomCode}<Copy className="size-5 opacity-60 transition-opacity group-hover:opacity-100" />
        </button>
        <p className="mt-1 text-sm text-white/80">Friends join with this code in Resona → Vibe.</p>
        <NowVibing />
      </div>
      {host && requests.length > 0 && (
        <section className="mt-4 rounded-2xl bg-glass p-3" aria-label="Join requests">
          <h3 className="mb-1 px-1 text-sm font-semibold">Wants to join</h3>
          {requests.map((r) => (
            <div key={r.userId} className="flex items-center gap-2 rounded-xl px-1 py-1.5">
              <span className="min-w-0 flex-1 truncate">{r.username}</span>
              <Button size="sm" onClick={() => approve(r.userId)}><Check />Approve</Button>
              <Button size="sm" variant="ghost" onClick={() => decline(r.userId)} aria-label={`Decline ${r.username}`}><X /></Button>
            </div>
          ))}
        </section>
      )}

      <h3 className="mt-5 mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-text-muted"><Users className="size-4" />Vibing · {users.filter((u) => u.isConnected).length}</h3>
      <ul>
        {users.map((u) => (
          <li key={u.userId} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="relative grid size-9 shrink-0 place-items-center rounded-full font-semibold text-white" style={{ background: avatarColor(u.username) }}>
              {u.isConnected && <span className="vibe-ring absolute inset-0 rounded-full border-2" style={{ borderColor: avatarColor(u.username) }} />}
              {u.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{u.username}{u.userId === session.userId && <span className="text-text-faint"> (you)</span>}</span>
            {(u.isHost || u.userId === hostId) && <Crown className="size-4 text-seed-soft" aria-label="Host" />}
            <span className={cn('size-2 rounded-full', u.isConnected ? 'bg-green-400' : 'bg-text-faint')} aria-label={u.isConnected ? 'Connected' : 'Away'} />
          </li>
        ))}
      </ul>

      {host && suggestions.length > 0 && (
        <section className="mt-4 rounded-2xl bg-glass p-3" aria-label="Suggestions">
          <h3 className="mb-1 px-1 text-sm font-semibold">Suggested songs</h3>
          {suggestions.map((sg) => (
            <div key={sg.id} className="flex items-center gap-2 rounded-xl px-1 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{sg.track.title}</span>
                <span className="block truncate text-xs text-text-muted">from {sg.from}</span>
              </span>
              <Button size="sm" onClick={() => acceptSuggestion(sg)}><Check />Add</Button>
              <Button size="sm" variant="ghost" onClick={() => declineSuggestion(sg)} aria-label={`Decline ${sg.track.title}`}><X /></Button>
            </div>
          ))}
        </section>
      )}

      <p className="mt-4 px-1 text-sm text-text-faint">
        {host
          ? 'You control playback. Everyone hears what you play; guests can suggest songs.'
          : 'The host controls playback. Use "Add to queue" on any song to suggest it to the host.'}
      </p>

      <Button variant="ghost" className="mt-3 w-full text-destructive" onClick={() => leaveRoom()}>
        <LogOut />Leave Vibe
      </Button>
    </div>
  );
}

const AVATAR_COLORS = ['#7c5cff', '#2fb6a0', '#f5a623', '#e5487d', '#3b82f6', '#22c55e', '#f97316', '#a855f7'];
/** A stable color per name, for friend avatars. */
function avatarColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** The room's current song with live equalizer bars. */
function NowVibing() {
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);
  if (!track) return null;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-black/25 p-2.5 backdrop-blur-sm">
      {track.thumbnail ? <img src={track.thumbnail} alt="" referrerPolicy="no-referrer" className="size-11 rounded-lg object-cover" /> : <span className="size-11 rounded-lg bg-white/10" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
        <span className="block truncate text-xs text-white/70">{track.artists.map((a) => a.name).join(', ')}</span>
      </span>
      {playing ? <Equalizer className="mr-1 h-4" bars={4} /> : <span className="mr-1 text-xs font-medium text-white/60">Paused</span>}
    </div>
  );
}
