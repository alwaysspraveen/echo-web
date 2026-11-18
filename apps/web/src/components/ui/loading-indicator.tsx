import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Port of Material 3 Expressive LoadingIndicator / ContainedLoadingIndicator, which Echo for
// Android uses (androidx.compose.material3 LoadingIndicator.kt, MaterialShapes.kt,
// LoadingIndicatorTokens.kt). Values below are copied from those files:
//   container 48dp, full corner; active indicator 38dp
//   uncontained colour = Primary; contained = OnPrimaryContainer on PrimaryContainer
//   shapes SoftBurst → Cookie9Sided → Pentagon → Pill → Sunny → Cookie4Sided → Oval (loop)
//   a morph every 650 ms with spring(dampingRatio 0.6, stiffness 200, visibilityThreshold 0.1)
//   rotation = progress·90° + 90° per finished morph + linear 360° every 4666 ms
// The shapes are built with the same vertices and corner roundings as MaterialShapes. The one
// difference: Compose morphs matched cubic features; here outlines are blended by angle.

type P = [number, number];
interface Vertex { p: P; r: number }

const CONTAINER = 48;
const ACTIVE = 38;
const MORPH_MS = 650;
const ROTATION_MS = 4666;
const DAMPING = 0.6;
const STIFFNESS = 200;
const VISIBILITY = 0.1;
const ANGLES = 180; // polar samples per shape

// ---------- MaterialShapes ----------
const rad = (deg: number) => (deg / 180) * Math.PI;
const rotate = ([x, y]: P, deg: number, [cx, cy]: P = [0, 0]): P => {
  const a = rad(deg), dx = x - cx, dy = y - cy;
  return [dx * Math.cos(a) - dy * Math.sin(a) + cx, dx * Math.sin(a) + dy * Math.cos(a) + cy];
};

/** MaterialShapes.doRepeat */
function doRepeat(points: Vertex[], reps: number, center: P, mirroring: boolean): Vertex[] {
  if (!mirroring) {
    const out: Vertex[] = [];
    for (let i = 0; i < points.length * reps; i++) {
      const v = points[i % points.length];
      out.push({ p: rotate(v.p, Math.floor(i / points.length) * (360 / reps), center), r: v.r });
    }
    return out;
  }
  const angles = points.map((v) => (Math.atan2(v.p[1] - center[1], v.p[0] - center[0]) * 180) / Math.PI);
  const dists = points.map((v) => Math.hypot(v.p[0] - center[0], v.p[1] - center[1]));
  const actual = reps * 2;
  const section = 360 / actual;
  const out: Vertex[] = [];
  for (let it = 0; it < actual; it++) {
    for (let index = 0; index < points.length; index++) {
      const i = it % 2 === 0 ? index : points.length - 1 - index;
      if (i > 0 || it % 2 === 0) {
        const a = rad(section * it + (it % 2 === 0 ? angles[i] : section - angles[i] + 2 * angles[0]));
        out.push({ p: [Math.cos(a) * dists[i] + center[0], Math.sin(a) * dists[i] + center[1]], r: points[i].r });
      }
    }
  }
  return out;
}
const custom = (pts: [number, number, number][], reps: number, mirroring = false) =>
  doRepeat(pts.map(([x, y, r]) => ({ p: [x, y] as P, r })), reps, [0.5, 0.5], mirroring);

/** RoundedPolygon.star */
function star(n: number, inner: number, r: number, rotateDeg = 0): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ p: rotate([Math.cos(rad((360 / n) * i)), Math.sin(rad((360 / n) * i))], rotateDeg), r });
    out.push({ p: rotate([inner * Math.cos(rad((360 / n) * (i + 0.5))), inner * Math.sin(rad((360 / n) * (i + 0.5)))], rotateDeg), r });
  }
  return out;
}

/** Outline of a polygon with circular corner rounding (RoundedPolygon without smoothing). */
function outline(vs: Vertex[]): P[] {
  const n = vs.length;
  const unit = (a: P, b: P): P => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  // Wanted cut along each edge for each corner, then scaled down where two cuts don't fit.
  const cut = vs.map((v, i) => {
    const d1 = unit(v.p, vs[(i + n - 1) % n].p), d2 = unit(v.p, vs[(i + 1) % n].p);
    const cos = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]));
    const sin = Math.sqrt(1 - cos * cos);
    return sin < 1e-6 ? 0 : (v.r * (cos + 1)) / sin;
  });
  const edgeRatio = vs.map((v, i) => {
    const w = vs[(i + 1) % n];
    const len = Math.hypot(w.p[0] - v.p[0], w.p[1] - v.p[1]);
    const want = cut[i] + cut[(i + 1) % n];
    return want > len ? len / want : 1;
  });
  const pts: P[] = [];
  vs.forEach((v, i) => {
    const ratio = Math.min(edgeRatio[i], edgeRatio[(i + n - 1) % n]);
    const c = cut[i] * ratio;
    if (c < 1e-6) { pts.push(v.p); return; }
    const d1 = unit(v.p, vs[(i + n - 1) % n].p), d2 = unit(v.p, vs[(i + 1) % n].p);
    const t1: P = [v.p[0] + d1[0] * c, v.p[1] + d1[1] * c];
    const t2: P = [v.p[0] + d2[0] * c, v.p[1] + d2[1] * c];
    const bis = unit([0, 0], [d1[0] + d2[0], d1[1] + d2[1]]);
    const half = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))) / 2;
    const rr = c * Math.tan(half);
    const dc = rr / Math.sin(half);
    const ctr: P = [v.p[0] + bis[0] * dc, v.p[1] + bis[1] * dc];
    let a1 = Math.atan2(t1[1] - ctr[1], t1[0] - ctr[0]);
    let a2 = Math.atan2(t2[1] - ctr[1], t2[0] - ctr[0]);
    let da = a2 - a1;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    const steps = 16;
    for (let s = 0; s <= steps; s++) { const a = a1 + (da * s) / steps; pts.push([ctr[0] + rr * Math.cos(a), ctr[1] + rr * Math.sin(a)]); }
    void a2;
  });
  return pts;
}

/** RoundedPolygon.normalized(): fit into the unit square, centred. */
function normalized(pts: P[]): P[] {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [l, t, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const side = Math.max(r - l, b - t);
  const ox = (side - (r - l)) / 2, oy = (side - (b - t)) / 2;
  return pts.map(([x, y]) => [(x - l + ox) / side, (y - t + oy) / side]);
}

function circle(sx: number, sy: number, deg: number): P[] {
  return Array.from({ length: 256 }, (_, i) => rotate([sx * Math.cos((i / 256) * 2 * Math.PI), sy * Math.sin((i / 256) * 2 * Math.PI)], deg));
}

const SHAPE_OUTLINES: P[][] = [
  outline(custom([[0.193, 0.277, 0.053], [0.176, 0.055, 0.053]], 10)), // SoftBurst
  outline(star(9, 0.8, 0.5, -90)), // Cookie9Sided
  outline(custom([[0.5, -0.009, 0.172], [1.03, 0.365, 0.164], [0.828, 0.97, 0.169]], 1, true)), // Pentagon
  outline(custom([[0.961, 0.039, 0.426], [1.001, 0.428, 0], [1.0, 0.609, 1.0]], 2, true)), // Pill
  outline(star(8, 0.8, 0.15)), // Sunny
  outline(custom([[1.237, 1.236, 0.258], [0.5, 0.918, 0.233]], 4)), // Cookie4Sided
  circle(1, 0.64, -45), // Oval
].map(normalized);

/** Radius from the centre (0.5, 0.5) at each sample angle, by ray casting the outline. */
function polar(pts: P[]): number[] {
  return Array.from({ length: ANGLES }, (_, k) => {
    const a = (k / ANGLES) * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      const ex = x2 - x1, ey = y2 - y1, fx = x1 - 0.5, fy = y1 - 0.5;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (fx * ey - fy * ex) / den; // along the ray
      const u = (fx * dy - fy * dx) / den; // along the edge
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  });
}
const SHAPES = SHAPE_OUTLINES.map(polar);

/** calculateScaleFactor(): shapes keep their size as they rotate, then × ActiveIndicatorScale. */
const SCALE = (() => {
  let f = 1;
  SHAPE_OUTLINES.forEach((pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const maxD = Math.max(...pts.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5)));
    f = Math.min(f, Math.max(w / (2 * maxD), h / (2 * maxD)));
  });
  return f * (ACTIVE / CONTAINER);
})();

/** Underdamped spring from 0 to 1 (Compose spring with dampingRatio 0.6, stiffness 200). */
const W = Math.sqrt(STIFFNESS), WD = W * Math.sqrt(1 - DAMPING * DAMPING);
const springAt = (t: number) => 1 - Math.exp(-DAMPING * W * t) * (Math.cos(WD * t) + ((DAMPING * W) / WD) * Math.sin(WD * t));
const springVel = (t: number) => Math.exp(-DAMPING * W * t) * ((W * W) / WD) * Math.sin(WD * t);
/** When the spring counts as finished (displacement and velocity under the threshold). */
const SPRING_END = (() => {
  for (let t = 0; t < 2; t += 0.001) if (Math.abs(1 - springAt(t)) < VISIBILITY && Math.abs(springVel(t)) < VISIBILITY * 62.5) return t;
  return 0.6;
})();

function framePath(size: number, from: number[], to: number[], progress: number, rotationDeg: number) {
  const s = size * SCALE;
  const pts: P[] = from.map((r0, k) => {
    const r = r0 + (to[k] - r0) * progress;
    const a = (k / ANGLES) * 2 * Math.PI;
    return [Math.cos(a) * r * s, Math.sin(a) * r * s];
  });
  // Centre by bounds (processPath), then rotate about the centre of the box.
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const c = size / 2, rr = rad(rotationDeg), cos = Math.cos(rr), sin = Math.sin(rr);
  let d = '';
  pts.forEach(([x, y], i) => {
    const px = x - mx, py = y - my;
    d += `${i ? 'L' : 'M'}${(c + px * cos - py * sin).toFixed(2)} ${(c + px * sin + py * cos).toFixed(2)}`;
  });
  return d + 'Z';
}

export function LoadingIndicator({ size = CONTAINER, contained, className, label = 'Loading' }: {
  /** Container size in px (M3 default 48). The shape is drawn at 38/48 of it. */
  size?: number;
  /** ContainedLoadingIndicator: shape on a round PrimaryContainer background. */
  contained?: boolean;
  className?: string;
  label?: string;
}) {
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const e = now - start;
      // Morph i starts at i·650 ms and runs the spring until it settles, then snaps to the next.
      const i = Math.floor(e / MORPH_MS);
      const st = (e - i * MORPH_MS) / 1000;
      const progress = st >= SPRING_END ? 0 : springAt(st);
      const index = st >= SPRING_END ? i + 1 : i;
      const targetAngle = 90 + 90 * index; // morphRotationTargetAngle starts at QuarterRotation
      const global = ((e % ROTATION_MS) / ROTATION_MS) * 360;
      const n = SHAPES.length;
      ref.current?.setAttribute('d', framePath(size, SHAPES[index % n], SHAPES[(index + 1) % n], progress, progress * 90 + (targetAngle % 360) + global));
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <span
      role="progressbar"
      aria-label={label}
      className={cn('relative inline-block shrink-0 rounded-full', contained ? 'bg-primary-container text-on-primary-container' : 'text-primary', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-hidden>
        <path ref={ref} fill="currentColor" />
      </svg>
    </span>
  );
}
