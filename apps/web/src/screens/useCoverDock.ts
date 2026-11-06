import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { DOCK_THRESHOLDS, nextDocked } from './coverDock';

/** The page is a container; Book.module.css goes two-column from this width. */
const WIDE = 800;

type VT = { finished: Promise<unknown> };
type Doc = Document & { startViewTransition?: (cb: () => void) => VT };

/**
 * True while the hero cover is scrolled out of view on the wide layout. The change runs inside a view
 * transition so the browser flies the shared `view-transition-name` element between hero and details card;
 * without support, or under reduced motion, it swaps instantly. `page` and `cover` are elements (state,
 * not refs) because the book renders after it loads.
 */
export function useCoverDock(page: HTMLElement | null, cover: HTMLElement | null): boolean {
  const [docked, setDocked] = useState(false);
  const target = useRef(false);
  const current = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    if (!page || !cover || typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | undefined;
    let alive = true;

    const apply = () => {
      if (running.current || target.current === current.current) return;
      const next = target.current;
      const doc = document as Doc;
      const set = () => {
        current.current = next;
        flushSync(() => setDocked(next));
      };
      if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return set();
      running.current = true;
      void doc.startViewTransition(set).finished.finally(() => {
        running.current = false;
        if (alive) apply(); // catch up with wherever the scroll ended while we were animating
      });
    };

    let wasWide: boolean | undefined;
    const observe = () => {
      const wide = page.clientWidth >= WIDE;
      if (wide === wasWide) return; // height changes also wake the ResizeObserver
      wasWide = wide;
      io?.disconnect();
      io = undefined;
      if (!wide) {
        target.current = false;
        return apply();
      }
      const bar = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      io = new IntersectionObserver(
        ([e]) => {
          if (!e) return;
          target.current = nextDocked(current.current, e.intersectionRatio);
          apply();
        },
        { rootMargin: `-${Math.round(bar)}px 0px 0px 0px`, threshold: DOCK_THRESHOLDS },
      );
      io.observe(cover);
    };

    observe();
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(observe);
    ro?.observe(page);
    return () => {
      alive = false;
      io?.disconnect();
      ro?.disconnect();
    };
  }, [page, cover]);

  return docked;
}
