/**
 * Back closes an overlay. While a dialog, sheet or popover is open it owns one history entry, pushed on top of the
 * page's own: the browser's Back (or an Android back gesture, or a swipe back) pops that entry and closes the overlay,
 * and the page stays where it was. Closing it any other way removes the entry again, so history ends up as it began.
 *
 * It depends only on the History API, not on any router, and does nothing where there isn't one. How it stays out of a
 * router's way:
 *
 * - The entry has the same URL and a copy of the current `history.state` plus one marker key, so a router that keeps its
 *   own key and index in `state` still finds them (and its location key doesn't change on the entry).
 * - Every `popstate` that is about our entries is swallowed in the capture phase (`stopImmediatePropagation`), before any
 *   router, scroll restoration or analytics listener sees it. A `popstate` that lands anywhere else is left alone.
 * - Our own removal of an entry (`history.go(-n)` is asynchronous) records the depth it is heading for, so the
 *   `popstate` it causes is recognised as ours and never mistaken for a person pressing Back.
 */

/** The key added to `history.state` on an overlay's entry: its depth (1 is the lowest overlay's entry). */
const MARK = '__ssBackToClose';

interface Overlay {
  /** Asks the owner to close (Back was pressed). It must not throw. */
  close: () => void;
  /** Has its entry been dealt with: pushed, or skipped because it can't be. */
  entry: boolean;
}

/** Live overlays, in the order they opened. */
let overlays: Overlay[] = [];
/** The entries we have pushed above the page's own, lowest first; null is an entry whose overlay has gone. */
let trail: (Overlay | null)[] = [];
/** While our own `history.go` is under way: the depth it ends at. Opens and closes wait for it. */
let target: number | null = null;
let targetTimer: ReturnType<typeof setTimeout> | undefined;
/** The page's own state key (a router's `key`) under the lowest entry, to tell Back to it from a jump elsewhere. */
let baseKey: unknown;
/** A bounce off a stale entry ends on a page the router hasn't been told it moved to, so that landing is let through. */
let informOnLand = false;
let listening = false;

const hasHistory = () =>
  typeof window !== 'undefined' &&
  typeof window.history !== 'undefined' &&
  typeof window.history.pushState === 'function' &&
  typeof window.history.go === 'function';

function depthOf(state: unknown): number {
  if (state && typeof state === 'object') {
    const d = (state as Record<string, unknown>)[MARK];
    if (typeof d === 'number' && d > 0) return d;
  }
  return 0;
}

const keyOf = (state: unknown): unknown =>
  state && typeof state === 'object' ? (state as Record<string, unknown>).key : undefined;

/** Our own traversal. If no `popstate` follows (nothing to go back to), stop waiting so overlays can't get stuck. */
function go(delta: number, to: number): void {
  target = to;
  clearTimeout(targetTimer);
  targetTimer = setTimeout(() => {
    target = null;
    trail = [];
    informOnLand = false;
    sync();
  }, 1000);
  try {
    window.history.go(delta);
  } catch {
    clearTimeout(targetTimer);
    target = null;
    trail = [];
  }
}

function push(o: Overlay): void {
  o.entry = true;
  const state: unknown = window.history.state;
  if (state !== null && typeof state !== 'object') return; // not ours to extend: this overlay just has no Back
  try {
    if (trail.length === 0) baseKey = keyOf(state);
    window.history.pushState({ ...(state as object | null), [MARK]: trail.length + 1 }, '');
    trail.push(o);
  } catch {
    // A sandboxed frame or a quota: the overlay still works, it just doesn't answer to Back.
  }
}

/** Brings history in line with the overlays that are open. Does nothing while a traversal of ours is under way. */
function sync(): void {
  if (!hasHistory() || target !== null) return;
  // Something else moved history while overlays were open (a route change, a replace): our entries are no longer on top.
  if (trail.length > 0 && depthOf(window.history.state) !== trail.length) trail = [];
  let gone = 0;
  while (trail.length > 0 && trail[trail.length - 1] === null) {
    trail.pop();
    gone++;
  }
  if (gone > 0) return go(-gone, trail.length);
  for (const o of overlays) if (!o.entry) push(o);
}

/** After a popstate we handled: leave a stale entry (one of a closed overlay, ahead of us) the way we came. */
function settle(): void {
  const d = depthOf(window.history.state);
  if (d > trail.length) {
    informOnLand = true;
    return go(-1, d - 1);
  }
  sync();
}

/** Closes every overlay whose entry is above `depth`: they were popped. */
function drop(depth: number): void {
  const popped = trail.splice(depth);
  for (const o of popped) {
    if (!o) continue;
    overlays = overlays.filter((x) => x !== o);
    o.close();
  }
}

function listen(): void {
  if (listening || !hasHistory()) return;
  window.addEventListener('popstate', onPop, true);
  listening = true;
}

function onPop(e: PopStateEvent): void {
  const state: unknown = window.history.state;
  const d = depthOf(state);
  if (target !== null) {
    if (d === target) {
      // The popstate of our own removal.
      clearTimeout(targetTimer);
      target = null;
      const landed = d === 0 && informOnLand;
      if (d === 0) informOnLand = false;
      if (!landed) e.stopImmediatePropagation();
      settle();
      return;
    }
    // Someone else moved history meanwhile: treat it as theirs.
    clearTimeout(targetTimer);
    target = null;
  }
  if (d > 0) {
    // One of our entries: below the top (Back), or an old one ahead (Forward into a closed overlay, or after a reload).
    e.stopImmediatePropagation();
    if (d <= trail.length) drop(d);
    settle();
    return;
  }
  if (trail.length > 0) {
    const back = keyOf(state) === baseKey;
    drop(0);
    if (back) e.stopImmediatePropagation(); // Back to the page the overlays sat on: the router has nothing to do
  }
}

/**
 * An overlay is open. Returns the function to call when it closes, for whatever reason; call that once, and it removes
 * the history entry (if still on top). `close` is called when Back pops the overlay's entry.
 */
export function registerOverlay(close: () => void): () => void {
  if (!hasHistory()) return () => {};
  const o: Overlay = { close, entry: false };
  overlays.push(o);
  listen();
  sync();
  return () => {
    const i = overlays.indexOf(o);
    if (i < 0) return; // popped by Back already
    overlays.splice(i, 1);
    const t = trail.indexOf(o);
    if (t >= 0) trail[t] = null;
    sync();
  };
}

/** Test seam: forget everything, as a fresh page load would. */
export function resetBackStack(): void {
  clearTimeout(targetTimer);
  if (listening) window.removeEventListener('popstate', onPop, true);
  listening = false;
  overlays = [];
  trail = [];
  target = null;
  baseKey = undefined;
  informOnLand = false;
}

// A reload (or a return from another site) landing on an entry that belonged to an overlay: that overlay is gone, so step
// back to the page it sat on, or the next Back would appear to do nothing.
if (hasHistory()) {
  listen();
  const stale = depthOf(window.history.state);
  if (stale > 0) {
    try {
      window.history.go(-stale);
    } catch {
      // ignore
    }
  }
}
