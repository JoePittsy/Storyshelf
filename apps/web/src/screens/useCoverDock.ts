import { flushSync } from 'react-dom';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { morphBetween } from '@joepittsy/ui';
import { DOCK_THRESHOLDS, nextDocked } from './coverDock';

/** The page is a container; Book.module.css goes two-column from this width. */
const WIDE = 800;

/**
 * True while the hero cover is scrolled out of view on the wide layout. The change pours the cover between the hero
 * and the docked cover in the Details card as a liquid morph (morphBetween); under reduced motion it swaps instantly.
 * `page` and `cover` are elements (state, not refs) because the book renders after it loads; `dock` is the docked
 * cover's frame, which only exists while docked.
 */
export function useCoverDock(
  page: HTMLElement | null,
  cover: HTMLElement | null,
  dock: RefObject<HTMLElement | null>,
  morph: { src: string | null; color: string | null }
): boolean {
  const [docked, setDocked] = useState(false);
  const target = useRef(false);
  const current = useRef(false);
  const running = useRef<{ to: boolean; abort: AbortController } | null>(null);
  const latest = useRef(morph);
  useEffect(() => {
    latest.current = morph;
  });

  useEffect(() => {
    if (!page || !cover || typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | undefined;
    let alive = true;

    const apply = () => {
      if (running.current || target.current === current.current) return;
      const next = target.current;
      const set = () => {
        current.current = next;
        flushSync(() => setDocked(next));
      };
      const run = (from: Element, to: Element, after?: () => void) => {
        const abort = new AbortController();
        running.current = { to: next, abort };
        const { src, color } = latest.current;
        void morphBetween(from, to, { src: src ?? undefined, color: color ?? undefined, signal: abort.signal }).finally(
          () => {
            running.current = null;
            if (alive) after?.();
            if (alive) apply(); // catch up with wherever the scroll ended while we were animating
          }
        );
      };
      if (next) {
        set(); // the docked cover has to exist to be measured; the morph hides both until it lands
        if (dock.current) run(cover, dock.current);
      } else if (dock.current) {
        // Morph first, while the docked cover is still there; skip the swap if the user scrolled back mid-flight.
        run(dock.current, cover, () => {
          if (target.current === next) set();
        });
      } else set();
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
          if (running.current && running.current.to !== target.current) running.current.abort.abort(); // jump to the end, then reverse
          apply();
        },
        { rootMargin: `-${Math.round(bar)}px 0px 0px 0px`, threshold: DOCK_THRESHOLDS }
      );
      io.observe(cover);
    };

    observe();
    const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(observe);
    ro?.observe(page);
    return () => {
      alive = false;
      running.current?.abort.abort();
      io?.disconnect();
      ro?.disconnect();
    };
  }, [page, cover, dock]);

  return docked;
}
