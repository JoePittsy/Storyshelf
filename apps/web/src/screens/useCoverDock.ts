import { useEffect } from 'react';
import { dockProgress } from './dockProgress';

/** The page is a container; Book.module.css goes two-column from this width. */
const WIDE = 800;

/**
 * Scroll-driven cover dock on the wide layout. As the hero cover scrolls under the top bar, progress t (0..1, a pure
 * function of its position) is published as `--dock-t` on the page. Book.module.css reads it: the hero cover
 * minimises and fades while the docked cover at the top of Details grows and fades in, and the dock's slot opens.
 * Only a custom property is written, inside rAF, so React never re-renders on scroll.
 *
 * Narrower than WIDE, `--dock-t` stays 0 and the hero is untouched. Under reduced motion t snaps to 0 or 1 at 0.5
 * (the CSS then only crossfades). `page` and `cover` are elements (state, not refs): the book renders after load.
 */
export function useCoverDock(page: HTMLElement | null, cover: HTMLElement | null): void {
  useEffect(() => {
    if (!page || !cover) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = '';
    const run = () => {
      raf = 0;
      let t = 0;
      if (page.clientWidth >= WIDE) {
        const rect = cover.getBoundingClientRect();
        const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
        t = dockProgress(rect.top, rect.height, bar);
        if (reduced) t = t >= 0.5 ? 1 : 0;
      }
      const v = String(t);
      if (v !== last) {
        last = v;
        page.style.setProperty('--dock-t', v);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    run();
    addEventListener('scroll', schedule, { capture: true, passive: true });
    addEventListener('resize', schedule);
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    ro?.observe(page);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', schedule, { capture: true });
      removeEventListener('resize', schedule);
      ro?.disconnect();
      page.style.removeProperty('--dock-t');
    };
  }, [page, cover]);
}
