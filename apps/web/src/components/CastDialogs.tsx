import { useEffect, useState } from 'react';
import { Cast, Music, Speaker, Tv } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { castBridge, castDeviceName, useCast, type CastDevice, type CastDeviceKind } from '@/lib/cast';
import { useCurrentTrack } from '@/player/store';
import { cn } from '@/lib/utils';

// Cast device picker and "Now Casting" session sheet.
// content, sizes (dp → px) and colour roles, shown as dialogs instead of bottom sheets.

export function CastDeviceIcon({ kind, className }: { kind: CastDeviceKind | undefined; className?: string }) {
  const Icon = kind === 'TV' ? Tv : kind === 'SPEAKER' ? Speaker : Cast;
  return <Icon className={className} />;
}

export function CastDialogs() {
  const pickerOpen = useCast((s) => s.pickerOpen);
  const sessionOpen = useCast((s) => s.sessionOpen);
  if (!castBridge) return null;
  return (
    <>
      <Dialog open={pickerOpen} onOpenChange={(o) => useCast.setState({ pickerOpen: o })}>
        <DialogContent className="sm:max-w-md">{pickerOpen && <Picker />}</DialogContent>
      </Dialog>
      <Dialog open={sessionOpen} onOpenChange={(o) => useCast.setState({ sessionOpen: o })}>
        <DialogContent className="sm:max-w-md">{sessionOpen && <Session />}</DialogContent>
      </Dialog>
    </>
  );
}

function Picker() {
  const devices = useCast((s) => s.devices);
  const status = useCast((s) => s.status);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    castBridge!.discover().then((d) => d.length && useCast.setState({ devices: d })).catch(() => {});
    // Keep scanning for a discovery window before showing the empty state (5 s).
    const t = setTimeout(() => setScanning(false), 5000);
    const again = setInterval(() => castBridge!.discover().catch(() => {}), 1500);
    return () => { clearTimeout(t); clearInterval(again); };
  }, []);

  const select = (d: CastDevice) => {
    useCast.setState({ pickerOpen: false });
    castBridge!.connect(d.id).catch(() => {});
  };

  return (
    <div className="pb-2">
      <div className="flex items-center gap-3 px-1">
        <Cast className="size-7 text-primary" aria-hidden />
        <DialogTitle className="text-[22px] leading-7 font-bold">Cast to</DialogTitle>
      </div>
      <DialogDescription className="sr-only">Choose a device on your network to play on</DialogDescription>
      <div className="h-4" />
      {scanning && (
        <div className="mb-3 h-0.5 overflow-hidden rounded-full bg-primary-container" role="progressbar" aria-label="Looking for devices">
          <div className="h-full w-1/3 animate-[cast-scan_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      )}
      {devices.length === 0 ? (
        scanning ? (
          <div className="grid place-items-center py-8">
            <span className="size-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" aria-hidden />
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-surface-high/50">
              <Cast className="size-8 text-text-muted/50" aria-hidden />
            </div>
            <p className="mt-4 font-medium">No devices found</p>
            <p className="mt-1.5 text-xs text-text-muted">Make sure your device is on the same Wi-Fi network</p>
          </div>
        )
      ) : (
        <ul className="flex flex-col gap-0.5">
          {devices.map((d) => {
            const selected = status.device?.id === d.id && status.state !== 'idle';
            return (
              <li key={d.id}>
                <button onClick={() => select(d)} className="flex w-full items-center rounded-xl px-3 py-3.5 text-left hover:bg-accent">
                  <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', selected ? 'bg-primary-container text-on-primary-container' : 'bg-surface-high/60')}>
                    <CastDeviceIcon kind={d.kind} className="size-6" />
                  </span>
                  <span className="ml-3.5 min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    {d.model && <span className="block truncate text-xs text-text-muted">{d.model}</span>}
                  </span>
                  {selected && <span className="ml-2 text-xs font-medium text-primary">{status.state === 'connected' ? 'Connected' : 'Connecting…'}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Session() {
  const status = useCast((s) => s.status);
  const track = useCurrentTrack();
  useEffect(() => { if (status.state === 'idle') useCast.setState({ sessionOpen: false }); }, [status.state]);
  const kind = status.device?.kind;

  return (
    <div className="pb-2">
      <div className="flex items-center gap-3 px-1">
        <CastDeviceIcon kind={kind} className="size-7 text-primary" />
        <DialogTitle className="text-[22px] leading-7 font-bold">Now Casting</DialogTitle>
      </div>
      <DialogDescription className="sr-only">The device you're casting to and what's playing</DialogDescription>
      <div className="h-5" />
      <div className="flex items-center rounded-[14px] bg-surface-high/50 px-4 py-3.5">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
          <CastDeviceIcon kind={kind} className="size-[26px]" />
        </span>
        <span className="ml-3.5 min-w-0 flex-1">
          <span className="block truncate font-medium">{castDeviceName(status)}</span>
          <span className="block text-xs text-primary">{status.state === 'connected' ? 'Connected' : 'Connecting…'}</span>
        </span>
      </div>
      {track && (
        <>
          <div className="h-4" />
          <div className="flex items-center rounded-[14px] bg-surface-high/50 px-4 py-3.5">
            {track.thumbnail ? (
              <img src={track.thumbnail} alt={track.title} referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-high"><Music className="size-6 text-text-muted" /></span>
            )}
            <span className="ml-3.5 min-w-0 flex-1">
              <span className="block truncate font-medium">{track.title}</span>
              <span className="block truncate text-xs text-text-muted">{track.artists.map((a) => a.name).join(', ')}</span>
            </span>
          </div>
        </>
      )}
      <div className="h-5" />
      <button
        onClick={() => { castBridge!.disconnect().catch(() => {}); useCast.setState({ sessionOpen: false }); }}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl font-medium text-error hover:bg-error/10"
      >
        <CastDeviceIcon kind={kind} className="size-5" />
        Disconnect
      </button>
    </div>
  );
}
