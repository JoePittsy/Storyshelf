import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOverlay, resetBackStack } from './backStack';

const tick = () => new Promise((r) => setTimeout(r, 30));
const key = () => (history.state as { key?: string } | null)?.key;

/** What a router sees: every popstate that reaches a bubble-phase listener, as the state key it landed on. */
let seen: (string | undefined)[] = [];
const router = () => seen.push(key());

/** The page's own entries, as a router makes them: a state with a key, a path, no overlay. */
const route = (k: string) => history.pushState({ key: k, idx: 1 }, '', `/${k}`);

beforeEach(async () => {
  resetBackStack();
  seen = [];
  window.addEventListener('popstate', router);
  history.replaceState({ key: 'a', idx: 0 }, '', '/a');
  route('b');
  await tick();
});
afterEach(() => window.removeEventListener('popstate', router));

/** Opens an overlay and keeps a spy for its Back. */
function open() {
  const close = vi.fn();
  const release = registerOverlay(close);
  return { close, release };
}

describe('backStack', () => {
  it('pushes one entry on the same URL, keeping the router state, and nothing for a second open of nothing', () => {
    const n = history.length;
    open();
    expect(history.length).toBe(n + 1);
    expect(location.pathname).toBe('/b');
    expect(key()).toBe('b');
  });

  it('Back closes the overlay, the route does not change, and the router never hears of it', async () => {
    const o = open();
    history.back();
    await tick();
    expect(o.close).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/b');
    expect(seen).toEqual([]);
  });

  it('a second Back then navigates as usual', async () => {
    const o = open();
    history.back();
    await tick();
    expect(o.close).toHaveBeenCalledTimes(1);
    history.back();
    await tick();
    expect(location.pathname).toBe('/a');
    expect(seen).toEqual(['a']);
  });

  it('closing it by hand puts history back as it was: the next Back goes to the previous route', async () => {
    const o = open();
    o.release();
    await tick();
    expect(o.close).not.toHaveBeenCalled();
    expect(seen).toEqual([]); // our own removal is invisible to the router
    expect(key()).toBe('b');
    history.back();
    await tick();
    expect(location.pathname).toBe('/a');
    expect(seen).toEqual(['a']);
  });

  it('Forward after a close does not reopen it, and the router does not hear of it', async () => {
    const o = open();
    o.release();
    await tick();
    history.forward();
    await tick();
    expect(o.close).not.toHaveBeenCalled();
    expect(key()).toBe('b');
    // The bounce ends on the page the router is already on, which it is told once: harmless, it changes nothing.
    expect(seen).toEqual(['b']);
  });

  it('Forward after Back-closing does not reopen it either', async () => {
    const o = open();
    history.back();
    await tick();
    history.forward();
    await tick();
    expect(o.close).toHaveBeenCalledTimes(1);
    expect(key()).toBe('b');
    expect(seen).toEqual(['b']);
  });

  it('nested overlays: Back closes only the top one', async () => {
    const lower = open();
    const upper = open();
    history.back();
    await tick();
    expect(upper.close).toHaveBeenCalledTimes(1);
    expect(lower.close).not.toHaveBeenCalled();
    history.back();
    await tick();
    expect(lower.close).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/b');
    expect(seen).toEqual([]);
    history.back();
    await tick();
    expect(location.pathname).toBe('/a');
  });

  it('the top one closing by itself leaves the one below open with its entry', async () => {
    const lower = open();
    const upper = open();
    upper.release();
    await tick();
    expect(lower.close).not.toHaveBeenCalled();
    expect(upper.close).not.toHaveBeenCalled();
    expect(seen).toEqual([]); // the popstate of our own removal is not Back for the lower one
    history.back();
    await tick();
    expect(lower.close).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/b');
  });

  it('the lower one closing first, then the upper: both entries go in one step', async () => {
    const lower = open();
    const upper = open();
    lower.release();
    upper.release();
    await tick();
    expect(seen).toEqual([]);
    history.back();
    await tick();
    expect(location.pathname).toBe('/a');
  });

  it('Back from the upper one while the lower one is gone leaves no stale entry', async () => {
    const lower = open();
    const upper = open();
    lower.release();
    history.back();
    await tick();
    expect(upper.close).toHaveBeenCalledTimes(1);
    expect(key()).toBe('b');
    expect(seen).toEqual([]);
  });

  it('rapid open, close, open: one entry, and one Back closes it', async () => {
    const n = history.length;
    const first = open();
    first.release();
    const second = open();
    await tick();
    expect(history.length).toBe(n + 1);
    expect(key()).toBe('b');
    history.back();
    await tick();
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(first.close).not.toHaveBeenCalled();
    expect(location.pathname).toBe('/b');
    expect(seen).toEqual([]);
  });

  it('a route change while open: the overlay closing afterwards moves nothing, and Back skips its old entry', async () => {
    const o = open();
    route('c'); // a link in the overlay
    o.release(); // and the overlay unmounts
    await tick();
    expect(location.pathname).toBe('/c');
    expect(seen).toEqual([]);
    history.back();
    await tick();
    // One press: past the old overlay entry to /b. The router hears of /b, never of the entry.
    expect(location.pathname).toBe('/b');
    expect(seen).toEqual(['b']);
  });

  it('a replace while open (a redirect) leaves nothing to undo', async () => {
    const o = open();
    history.replaceState({ key: 'in', idx: 1 }, '', '/in');
    o.release();
    await tick();
    expect(location.pathname).toBe('/in');
    expect(seen).toEqual([]);
    history.back();
    await tick();
    expect(location.pathname).toBe('/b');
    expect(seen).toEqual(['b']);
  });

  it('Back to a different route while open closes the overlay and the router follows', async () => {
    const o = open();
    history.go(-2);
    await tick();
    expect(o.close).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/a');
    expect(seen).toEqual(['a']);
  });

  it('closing twice, or after Back, does nothing more', async () => {
    const o = open();
    history.back();
    await tick();
    o.release();
    o.release();
    await tick();
    expect(location.pathname).toBe('/b');
    expect(seen).toEqual([]);
  });

  it('works on a page with no router state at all', async () => {
    history.replaceState(null, '', '/plain');
    const o = open();
    history.back();
    await tick();
    expect(o.close).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/plain');
  });

  it('a reload that lands on an overlay entry steps back off it', async () => {
    const go = vi.spyOn(history, 'go').mockImplementation(() => {});
    history.replaceState({ key: 'b', idx: 1, __ssBackToClose: 1 }, '', '/b');
    vi.resetModules();
    await import('./backStack');
    expect(go).toHaveBeenCalledWith(-1);
    go.mockRestore();
  });

  it('is inert where there is no History API', async () => {
    vi.stubGlobal('history', undefined);
    vi.resetModules();
    const fresh = await import('./backStack');
    const close = vi.fn();
    expect(() => fresh.registerOverlay(close)()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
