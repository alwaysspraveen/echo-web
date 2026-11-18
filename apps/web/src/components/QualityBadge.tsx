import { formatDetail, isHiRes, useNowSource } from '@/player/source';
import { cn } from '@/lib/utils';

/**
 * The playing song's audio quality. Hi-Res (24-bit, or above 48 kHz) gets its own gold mark;
 * CD-quality FLAC shows "Lossless"; other sources show their label (e.g. 320KBPS · AAC).
 */
export function QualityBadge({ className, large }: { className?: string; large?: boolean }) {
  const s = useNowSource();
  if (!s.label || s.label === 'Downloaded') return null;
  const detail = formatDetail(s);
  const text = large ? 'text-xs' : 'text-[10px]';
  if (isHiRes(s)) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)} title={`Hi-Res lossless${detail ? `: ${detail}` : ''}`}>
        <span className={cn('inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-[#f6dc8a] to-[#d4a84b] px-1.5 font-extrabold tracking-wide text-[#2a1d05] shadow-[inset_0_1px_0_rgb(255_255_255/0.5)]', text)}>
          <HiResMark className={large ? 'size-3.5' : 'size-3'} />Hi-Res
        </span>
        {detail && <span className={cn('font-semibold tabular-nums text-[#e9c977]', text)}>{detail}</span>}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('rounded-md bg-seed/20 px-1.5 font-bold tracking-wide text-seed-soft', text)}>{s.label === 'LOSSLESS · FLAC' ? 'LOSSLESS' : s.label}</span>
      {detail && <span className={cn('font-semibold tabular-nums text-text-muted', text)}>{detail}</span>}
    </span>
  );
}

/** Resona's own Hi-Res mark: a waveform rising past a baseline. */
function HiResMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 9.5v1M5 6v8M8 3v11M11 5.5v7M14 8.5v3" />
      </g>
    </svg>
  );
}
