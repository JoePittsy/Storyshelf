import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { planScroll } from './scrollRestore';

/** Positions by history entry (location.key), for this tab's session. */
const positions = new Map<string, number>();
/** Content often arrives after the route renders (cached or fetched), so a restore keeps trying this long. */
const RESTORE_MS = 1500;

/**
 * Window scroll for a plain (non-data) router: a new page opens at the top, back and forward return to where each
 * entry was left. The browser's own restoration is switched off because it runs before the page's content exists.
 */
export function useScrollRestoration(): void {
  const { key, pathname } = useLocation();
  const action = useNavigationType();
  const keyRef = useRef(key);
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    const prior = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const onScroll = () => positions.set(keyRef.current, scrollY);
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      history.scrollRestoration = prior;
    };
  }, []);

  useLayoutEffect(() => {
    keyRef.current = key;
    const plan = planScroll(action, prevPath.current, pathname, positions.get(key));
    prevPath.current = pathname;
    if (plan.kind === 'keep') return;
    const y = plan.kind === 'top' ? 0 : plan.y;
    scrollTo({ top: y, left: 0, behavior: 'instant' });
    if (y === 0) return;
    // The page may still be too short to reach y: retry until it can, or the person scrolls, or time is up.
    const until = performance.now() + RESTORE_MS;
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      removeEventListener('wheel', stop);
      removeEventListener('touchstart', stop);
      removeEventListener('keydown', stop);
    };
    const step = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: Math.min(y, Math.max(0, max)), behavior: 'instant' });
      if (Math.abs(scrollY - y) < 1 || performance.now() > until) return stop();
      raf = requestAnimationFrame(step);
    };
    addEventListener('wheel', stop, { passive: true });
    addEventListener('touchstart', stop, { passive: true });
    addEventListener('keydown', stop);
    step();
    return stop;
  }, [key, action, pathname]);
}
