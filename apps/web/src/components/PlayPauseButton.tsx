import { useEffect, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

// Echo for Android's play button: a rounded square while paused that morphs into a slowly
// spinning 9-wave "cookie" while playing (WavyShape in Player.kt: 9 sides, 8% indent, one turn
// every 8 s, 300 ms morph), and springs to 90% when pressed.
const SIDES = 9;
const INDENT = 0.08;
const TURN_MS = 8000;
const MORPH_MS = 300;
const STEPS = 120;

/** Squircle (superellipse) radius at `a`, scaled so it fills the button like a rounded square. */
const squircle = (a: number) => 0.92 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 5) + Math.pow(Math.abs(Math.sin(a)), 5), 1 / 5);
const wavy = (a: number, rot: number) => 1 - INDENT + INDENT * Math.cos(SIDES * (a - rot));

function shapePath(size: number, t: number, rot: number) {
  const c = size / 2;
  let d = '';
  for (let i = 0; i < STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2;
    const r = c * (squircle(a) * (1 - t) + wavy(a, rot) * t);
    d += `${i ? 'L' : 'M'}${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
}

export function PlayPauseButton({ playing, disabled, onClick, size = 44, className, fill = 'var(--text)', iconClass = 'text-bg' }: {
  playing: boolean;
  disabled?: boolean;
  onClick: () => void;
  size?: number;
  className?: string;
  fill?: string;
  iconClass?: string;
}) {
  const path = useRef<SVGPathElement>(null);
  const state = useRef({ t: playing ? 1 : 0, rot: 0, last: 0 });

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = state.current;
    let raf = 0;
    const target = playing ? 1 : 0;
    s.last = performance.now();
    const frame = (now: number) => {
      const dt = now - s.last;
      s.last = now;
      s.t = target > s.t ? Math.min(target, s.t + dt / MORPH_MS) : Math.max(target, s.t - dt / MORPH_MS);
      if (!reduce) s.rot = (s.rot + (dt / TURN_MS) * Math.PI * 2) % (Math.PI * 2);
      path.current?.setAttribute('d', shapePath(size, s.t, s.rot));
      // Keep spinning while playing; stop once the morph back to the square finishes.
      if ((playing && !reduce) || s.t !== target) raf = requestAnimationFrame(frame);
    };
    path.current?.setAttribute('d', shapePath(size, s.t, s.rot));
    raf = requestAnimationFrame(frame);
    // Don't spin in a hidden window.
    const onVis = () => { if (!document.hidden) { s.last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [playing, size]);

  const icon = Math.round(size * 0.45);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? 'Pause' : 'Play'}
      className={cn(
        'relative grid shrink-0 place-items-center transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:scale-105 active:scale-90 active:duration-100 disabled:opacity-35 disabled:hover:scale-100',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 overflow-visible" aria-hidden>
        <path ref={path} fill={fill} />
      </svg>
      {/* Like Android, the button always shows play/pause, even while buffering. */}
      <span key={playing ? 'p' : 's'} className={cn('relative animate-in zoom-in-50 fade-in-0 duration-200', iconClass)}>
        {playing ? (
          <Pause className="fill-current" style={{ width: icon, height: icon }} />
        ) : (
          <Play className="translate-x-[1.5px] fill-current" style={{ width: icon, height: icon }} />
        )}
      </span>
    </button>
  );
}
