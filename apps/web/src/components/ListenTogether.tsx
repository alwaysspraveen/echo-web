import { useState } from 'react';
import { Check, Copy, Crown, LogOut, Radio, Smartphone, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { acceptSuggestion, approve, decline, declineSuggestion, joinRoom, leaveRoom, ltIsHost, startRoom, useLt } from '@/lib/listenTogether';
import { useUi } from '@/player/store';
import { cn } from '@/lib/utils';

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
      <DialogContent className="max-w-md">
        <DialogTitle className="font-display text-2xl font-extrabold tracking-tight">Listen Together</DialogTitle>
        <DialogDescription className="text-text-muted">
          Everyone hears the same song at the same moment, on laptops and on phones with Echo for Android.
        </DialogDescription>

        <label className="grid gap-1.5 text-sm font-medium">
          Your name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="How others see you" />
        </label>

        <Button size="lg" onClick={start} disabled={busy}><Radio />{status === 'connecting' ? 'Starting…' : 'Start a room'}</Button>

        <div className="flex items-center gap-3 text-xs text-text-faint"><span className="h-px flex-1 bg-line" />or join one<span className="h-px flex-1 bg-line" /></div>

        <form onSubmit={join} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            placeholder="Room code"
            aria-label="Room code"
            className="font-display text-lg tracking-[0.2em] uppercase placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case"
          />
          <Button type="submit" variant="secondary" size="lg" disabled={busy}>Join</Button>
        </form>

        {status === 'waiting' && <p className="text-sm text-text-muted">Waiting for the host to approve you…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="flex items-center gap-2 text-xs text-text-faint"><Smartphone className="size-3.5" />On Android: Echo → Listen Together. The same codes work both ways.</p>
      </DialogContent>
    </Dialog>
  );
}

export function ListenTogetherPanel() {
  const { session, status, users, requests, suggestions, hostId } = useLt();
  if (!session) return <p className="px-5 py-6 text-sm text-text-muted">You're not in a room.</p>;
  const host = ltIsHost();
  const copy = () => navigator.clipboard.writeText(session.roomCode).then(() => toast('Code copied'));

  return (
    <div className="px-4 pb-6">
      <div className="rounded-[24px] bg-gradient-to-br from-seed/60 to-seed/15 p-5">
        <p className="text-sm font-medium text-white/80">
          {host ? 'Your room' : 'In a room'}
          {status === 'reconnecting' && ' · reconnecting…'}
          {status === 'connecting' && ' · connecting…'}
        </p>
        <button onClick={copy} className="mt-1 flex items-center gap-2 font-display text-4xl font-extrabold tracking-[0.12em] text-white" aria-label={`Copy room code ${session.roomCode}`}>
          {session.roomCode}<Copy className="size-5 opacity-70" />
        </button>
        <p className="mt-2 text-sm text-white/80">Friends join with this code from Echo on a laptop, or Listen Together in Echo for Android.</p>
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

      <h3 className="mt-5 mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-text-muted"><Users className="size-4" />Listening · {users.filter((u) => u.isConnected).length}</h3>
      <ul>
        {users.map((u) => (
          <li key={u.userId} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-surface-high font-semibold">{u.username.slice(0, 1).toUpperCase()}</span>
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
        <LogOut />Leave room
      </Button>
    </div>
  );
}
