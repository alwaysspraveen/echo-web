import * as React from 'react';
import { cn } from '@/lib/utils';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Value restored on double-click. */
  defaultValue: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  /** Bipolar knobs (e.g. ±12 dB) fill from the centre; others fill from the minimum. */
  bipolar?: boolean;
  size?: number;
  disabled?: boolean;
}

const START = -135; // degrees, 0 = up
const SWEEP = 270;

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
  if (Math.abs(to - from) < 0.01) return '';
  const [a, b] = [Math.min(from, to), Math.max(from, to)];
  const [x1, y1] = polar(cx, cy, r, a);
  const [x2, y2] = polar(cx, cy, r, b);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/**
 * Rotary knob: drag up/down (Shift = fine), scroll, or use arrow keys; double-click resets.
 * Exposed to assistive tech as a slider.
 */
export function Knob({ label, value, min, max, step, defaultValue, onChange, format, bipolar, size = 72, disabled }: KnobProps) {
  const drag = React.useRef<{ y: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const frac = (value - min) / (max - min);
  const angle = START + frac * SWEEP;
  const zeroAngle = bipolar ? START + ((0 - min) / (max - min)) * SWEEP : START;
  const c = size / 2;
  const r = c - 6;
  const [px, py] = polar(c, c, r - 9, angle);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const range = (max - min) * (e.shiftKey ? 0.25 : 1);
    onChange(clamp(drag.current.v + ((drag.current.y - e.clientY) / 180) * range));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    onChange(clamp(value + (e.deltaY < 0 ? step : -step) * (e.shiftKey ? 1 : 2)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const big = (max - min) / 10;
    const next =
      e.key === 'ArrowUp' || e.key === 'ArrowRight' ? value + step
      : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? value - step
      : e.key === 'PageUp' ? value + big
      : e.key === 'PageDown' ? value - big
      : e.key === 'Home' ? min
      : e.key === 'End' ? max
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clamp(next));
  };

  return (
    <div className={cn('flex select-none flex-col items-center gap-1.5', disabled && 'opacity-45')}>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onDoubleClick={() => !disabled && onChange(defaultValue)}
        className={cn('touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-seed-soft', disabled ? 'cursor-not-allowed' : 'cursor-ns-resize')}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <path d={arc(c, c, r, START, START + SWEEP)} stroke="var(--line)" strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d={arc(c, c, r, zeroAngle, angle)} stroke="var(--seed)" strokeWidth={5} fill="none" strokeLinecap="round" />
          <circle cx={c} cy={c} r={r - 8} fill="var(--surface-high)" />
          <circle cx={c} cy={c} r={r - 8} fill="none" stroke="rgb(255 255 255 / 0.06)" />
          <line x1={c} y1={c} x2={px} y2={py} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-xs font-semibold">{label}</span>
      <span className="-mt-1 text-[11px] tabular-nums text-text-muted">{format(value)}</span>
    </div>
  );
}
