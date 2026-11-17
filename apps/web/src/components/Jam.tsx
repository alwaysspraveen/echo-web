import { useState } from 'react';
import { Copy, Crown, LogOut, Radio, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { isHost, joinJam, leaveJam, setAllowControl, startJam, useJam } from '@/lib/jam';
import { useUi } from '@/player/store';
import { cn } from '@/lib/utils';

/** Opens the Jam panel when in a Jam, otherwise the Start/Join dialog. */
export function openJam() {
  if (useJam.getState().session) useUi.getState().setPanel('jam');
  else useJam.getState().setDialogOpen(true);
}

export function JamDialog() {
  const { dialogOpen, setDialogOpen, status, name: savedName } = useJam();
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState('');
  const [ownCode, setOwnCode] = useState('');
  const [error, setError] = useState('');
  const busy = status === 'connecting';

  const done = () => { setDialogOpen(false); setError(''); setCode(''); useUi.getState().setPanel('jam'); };

  const start = async () => {
    setError('');
    try {
      if (ownCode && !/^[A-Z0-9]{4,12}$/.test(ownCode)) { setError('Room codes are 4 to 12 letters or digits.'); return; }
      const c = await startJam(name.trim() || 'Host', ownCode || undefined);
      setOwnCode('');
      done();
      toast(`Jam started. Share the code ${c}`);
    } catch (e) { setError((e as Error).message); }
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Z0-9]{4,12}$/.test(code.trim())) { setError('Enter the room code from the host.'); return; }
    try {
      await joinJam(code, name.trim() || 'Guest');
      done();
      toast('You joined the Jam');
    } catch (e2) { setError((e2 as Error).message); }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setError(''); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="font-display text-2xl font-extrabold tracking-tight">Jam</DialogTitle>
        <DialogDescription className="text-text-muted">
          Listen together in real time. Everyone hears the same song at the same moment, and anyone can add to the queue.
        </DialogDescription>

        <label className="grid gap-1.5 text-sm font-medium">
          Your name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="How others see you" />
        </label>

        <div className="flex gap-2">
          <Input
            value={ownCode}
            onChange={(e) => setOwnCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            placeholder="Room code (optional)"
            aria-label="Room code for your Jam (optional)"
            className="font-display tracking-[0.15em] uppercase placeholder:tracking-normal placeholder:normal-case"
          />
          <Button size="lg" onClick={start} disabled={busy} className="shrink-0"><Radio />Start a Jam</Button>
        </div>
        <p className="-mt-2 text-xs text-text-faint">Leave the code empty for a random one, or pick your own, like PARTY1.</p>

        <div className="flex items-center gap-3 text-xs text-text-faint"><span className="h-px flex-1 bg-line" />or join one<span className="h-px flex-1 bg-line" /></div>

        <form onSubmit={join} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            placeholder="Room code, e.g. KAZBE7"
            aria-label="Jam code"
            className="font-display text-lg tracking-[0.2em] uppercase placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case"
          />
          <Button type="submit" variant="secondary" size="lg" disabled={busy}>Join</Button>
        </form>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

export function JamPanel() {
  const { room, session, status } = useJam();
  if (!session) return <p className="px-5 py-6 text-sm text-text-muted">You're not in a Jam.</p>;
  if (!room) return <p className="px-5 py-6 text-sm text-text-muted">Connecting to the Jam…</p>;
  const host = isHost();
  const copy = () => navigator.clipboard.writeText(room.code).then(() => toast('Code copied'));

  return (
    <div className="px-4 pb-6">
      <div className="rounded-[24px] bg-gradient-to-br from-seed/60 to-seed/15 p-5">
        <p className="text-sm font-medium text-white/80">{host ? 'Your Jam' : 'In a Jam'}{status === 'reconnecting' && ' · reconnecting…'}</p>
        <button onClick={copy} className="mt-1 flex items-center gap-2 font-display text-4xl font-extrabold tracking-[0.15em] text-white" aria-label={`Copy Jam code ${room.code}`}>
          {room.code}<Copy className="size-5 opacity-70" />
        </button>
        <p className="mt-2 text-sm text-white/80">Friends open Echo, choose Jam → Join, and enter this code.</p>
      </div>

      <h3 className="mt-5 mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-text-muted"><Users className="size-4" />Listening · {room.members.filter((m) => m.active).length}</h3>
      <ul>
        {room.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-surface-high font-semibold">{m.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate">{m.name}{m.id === session.memberId && <span className="text-text-faint"> (you)</span>}</span>
            {m.id === room.hostId && <Crown className="size-4 text-seed-soft" aria-label="Host" />}
            <span className={cn('size-2 rounded-full', m.active ? 'bg-green-400' : 'bg-text-faint')} aria-label={m.active ? 'Listening' : 'Away'} />
          </li>
        ))}
      </ul>

      {host && (
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-glass p-3.5">
          <span>
            <span className="block font-semibold">Everyone can control</span>
            <span className="block text-sm text-text-muted">Play, pause, skip and seek. Adding songs is always allowed.</span>
          </span>
          <input type="checkbox" className="size-5 accent-[var(--seed)]" checked={room.allowControl} onChange={(e) => setAllowControl(e.target.checked).catch((err) => toast.error(err.message))} />
        </label>
      )}

      <p className="mt-4 px-1 text-sm text-text-faint">Each person's Echo plays the music on their own device. Add songs with "Add to queue" or "Play next".</p>

      <Button variant="ghost" className="mt-3 w-full text-destructive" onClick={() => leaveJam()}>
        <LogOut />{host ? 'End Jam for everyone' : 'Leave Jam'}
      </Button>
    </div>
  );
}
