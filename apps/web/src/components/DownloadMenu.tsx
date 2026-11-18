import { useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Download, FileAudio, HardDriveDownload, Trash2 } from 'lucide-react';
import type { Track } from '@resona/shared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { downloadTrack } from '@/lib/download';
import { removeOffline, saveOffline, useDownloadProgress, useIsOffline } from '@/lib/offline';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

/** Icon that shows a song's offline state: downloaded ✓, downloading (ring), or plain. */
export function DownloadStateIcon({ track, className }: { track: Track; className?: string }) {
  const saved = useIsOffline(track.id);
  const progress = useDownloadProgress(track.id);
  if (progress !== undefined) return <ProgressRing value={progress} className={className} />;
  if (saved) return <CircleCheck className={cn('fill-seed text-bg', className)} aria-label="Downloaded" />;
  return <Download className={className} />;
}

function ProgressRing({ value, className }: { value: number; className?: string }) {
  const r = 8, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" className={cn('-rotate-90', className)} aria-label={`Downloading ${Math.round(value * 100)}%`}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--seed)" strokeWidth="2.5" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, value))} strokeLinecap="round" />
    </svg>
  );
}

/**
 * A download button that opens on hover (or click) with two choices:
 * keep the song in the app for offline play, or save an MP3 file to the computer.
 */
export function DownloadMenu({ track, children, align = 'end' }: { track: Track; children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const saved = useIsOffline(track.id);
  const progress = useDownloadProgress(track.id);
  const format = useSettings((s) => s.downloadFormat);
  const fileLabel = format === 'mp3' ? 'Download MP3 file' : format === 'opus' ? 'Download .opus file' : 'Download .m4a file';

  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 180); };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild onPointerEnter={show} onPointerLeave={hide}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="top" sideOffset={8} className="w-64" onPointerEnter={show} onPointerLeave={hide}>
        {progress !== undefined ? (
          <DropdownMenuItem disabled><HardDriveDownload />Downloading for offline… {Math.round(progress * 100)}%</DropdownMenuItem>
        ) : saved ? (
          <DropdownMenuItem variant="destructive" onSelect={() => removeOffline(track)}><Trash2 />Remove offline download</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => saveOffline(track)}>
            <HardDriveDownload />
            <span className="flex flex-col">
              <span>Save for offline</span>
              <span className="text-xs text-text-muted">Play in Resona without internet</span>
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => downloadTrack(track)}>
          <FileAudio />
          <span className="flex flex-col">
            <span>{fileLabel}</span>
            <span className="text-xs text-text-muted">Save a file to your Downloads folder</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
