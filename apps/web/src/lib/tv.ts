// Android TV: the TV app (apps/tv) runs this web app in a WebView and injects `window.echoTv`.
// Here: remote-control navigation (D-pad moves focus to the nearest control in that direction,
// OK activates, Back goes back), media keys, and a 1280-wide layout for the 10-foot view.
import { audio } from '@/player/audio';
import { usePlayer, useUi } from '@/player/store';

interface EchoTv { exit(): void; voiceSearch(): void }
export const tvBridge: EchoTv | undefined = typeof window !== 'undefined' ? (window as unknown as { echoTv?: EchoTv }).echoTv : undefined;
export const isTv = !!tvBridge;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [role=slider]:not([aria-disabled=true]), [role=tab], [role=radio], [role=switch], [tabindex]:not([tabindex="-1"])';

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false; // off-screen is fine (shelves scroll); hidden is not
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden=true], [inert]');
}

/** The open dialog, if any (focus stays inside it), else the whole page. */
function scope(): ParentNode {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role=dialog][data-state=open], [role=alertdialog][data-state=open], [role=menu][data-state=open], [role=listbox]')];
  return dialogs.at(-1) ?? document;
}

type Dir = 'up' | 'down' | 'left' | 'right';
function nearest(from: DOMRect, dir: Dir): HTMLElement | null {
  const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of scope().querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (el === document.activeElement || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    // Must lie in that direction (edge-based, so neighbours in a row/column qualify).
    const ahead =
      dir === 'right' ? r.left >= from.right - 4 || (ex > cx + 4 && r.left > from.left + 4)
      : dir === 'left' ? r.right <= from.left + 4 || (ex < cx - 4 && r.right < from.right - 4)
      : dir === 'down' ? r.top >= from.bottom - 4 || (ey > cy + 4 && r.top > from.top + 4)
      : r.bottom <= from.top + 4 || (ey < cy - 4 && r.bottom < from.bottom - 4);
    if (!ahead) continue;
    const horizontal = dir === 'left' || dir === 'right';
    const main = horizontal ? Math.abs(ex - cx) : Math.abs(ey - cy);
    // Overlap on the cross axis is strongly preferred (stay in the same row / column).
    const overlap = horizontal ? Math.min(r.bottom, from.bottom) - Math.max(r.top, from.top) : Math.min(r.right, from.right) - Math.max(r.left, from.left);
    const cross = horizontal ? Math.abs(ey - cy) : Math.abs(ex - cx);
    const score = main + (overlap > 0 ? 0 : cross * 3 + 400);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

function move(dir: Dir) {
  const active = document.activeElement as HTMLElement | null;
  const start = active && active !== document.body && scope().contains(active) ? active : null;
  if (!start) {
    // Nothing focused yet: start in the main content.
    const first = [...(document.querySelector('main') ?? scope()).querySelectorAll<HTMLElement>(FOCUSABLE)].find(visible);
    first?.focus();
    first?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }
  const next = nearest(start.getBoundingClientRect(), dir);
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  } else {
    // At an edge: scroll the page so off-screen content can come into view.
    const scroller = start.closest<HTMLElement>('main, [data-scroll]') ?? document.scrollingElement;
    scroller?.scrollBy({ top: dir === 'down' ? 300 : dir === 'up' ? -300 : 0, behavior: 'smooth' });
  }
}

/** Remote Back: close what's open, else go back, else leave the app. */
export function tvBack() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const open = document.querySelector('[role=dialog][data-state=open], [role=menu][data-state=open]');
  if (open) { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
  if (useUi.getState().nowPlaying) { useUi.getState().setNowPlaying(false); return; }
  if (location.pathname !== '/') { history.back(); return; }
  tvBridge?.exit();
}

export function initTv() {
  if (!isTv) return;
  document.documentElement.classList.add('tv');
  // Same proportions as the Mac app: lay the desktop UI out 1280 px wide, scaled up to the TV.
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=1280, user-scalable=no');
  // Start with the Queue/Lyrics panel closed so the main content gets the screen.
  useUi.getState().setPanel(null);
  (window as unknown as { echoTvBack: () => void }).echoTvBack = tvBack;

  window.addEventListener('keydown', (e) => {
    const dir = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const)[e.key as string];
    const p = usePlayer.getState();
    // Media keys on the remote.
    if (e.key === 'MediaPlayPause') { e.preventDefault(); p.togglePlay(); return; }
    if (e.key === 'MediaPlay') { e.preventDefault(); p.setPlaying(true); return; }
    if (e.key === 'MediaPause' || e.key === 'MediaStop') { e.preventDefault(); p.setPlaying(false); return; }
    if (e.key === 'MediaTrackNext' || e.key === 'MediaFastForward') { e.preventDefault(); p.next(); return; }
    if (e.key === 'MediaTrackPrevious' || e.key === 'MediaRewind') { e.preventDefault(); p.prev(audio.currentTime); return; }
    if (e.key === 'GoBack' || e.key === 'BrowserBack') { e.preventDefault(); tvBack(); return; }
    if (!dir) return;
    const el = document.activeElement as HTMLElement | null;
    // Text fields keep left/right for the cursor; sliders and knobs keep left/right for their value.
    const horizontal = dir === 'left' || dir === 'right';
    if (horizontal && el && (el.matches('input[type=text], input[type=search], input:not([type]), textarea') || el.getAttribute('role') === 'slider')) return;
    // Lists like search suggestions handle up/down themselves.
    if (!horizontal && el?.getAttribute('role') === 'combobox' && el.getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    e.stopPropagation();
    move(dir);
  }, true);
}
