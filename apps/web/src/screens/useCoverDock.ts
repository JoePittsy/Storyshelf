import { useEffect, type RefObject } from 'react';
import { createGenie, measureBox, tFromScroll, type Genie } from '@joepittsy/ui';

/** The page is a container; Book.module.css goes two-column from this width. */
const WIDE = 800;

/**
 * Scroll-scrubbed cover dock on the wide layout. As the hero cover scrolls under the top bar, progress t (0..1, a pure
 * function of its position) drives a WebGL genie warp of the cover image from the hero into the docked cover at the top
 * of the Details card. Between 0 and 1 both real covers are hidden and the canvas draws; at the ends the real element
 * shows, so the swap is invisible. The docked slot's reserved height follows t (`--dock-t`), so Details eases down.
 *
 * Under reduced motion, without WebGL, or if the image can't be used as a texture, it swaps once at t >= 0.5.
 * `page` and `cover` are elements (state, not refs) because the book renders after it loads.
 */
export function useCoverDock(
  page: HTMLElement | null,
  cover: HTMLElement | null,
  dock: RefObject<HTMLElement | null>,
  slot: RefObject<HTMLElement | null>,
  src: string | null
): void {
  useEffect(() => {
    if (!page || !cover) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let genie: Genie | null = null;
    let raf = 0;
    let last = '';

    const show = (el: HTMLElement | null, visible: boolean) => {
      if (el) el.style.visibility = visible ? '' : 'hidden';
    };
    const run = () => {
      raf = 0;
      const d = dock.current;
      const s = slot.current;
      const rect = cover.getBoundingClientRect();
      if (page.clientWidth < WIDE || !d || !s || rect.height <= 0) {
        show(cover, true);
        show(d, false);
        genie?.hide();
        s?.style.setProperty('--dock-t', '0');
        last = '';
        return;
      }
      const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
      const t = tFromScroll(rect.top, rect.height, bar);
      const canWarp = !reduced && genie !== null && genie.ready && !genie.failed;
      if (canWarp && t > 0 && t < 1) {
        s.style.setProperty('--dock-t', String(t));
        const a = measureBox(cover);
        const b = measureBox(d);
        const key = `${t}|${a?.x}|${a?.y}|${b?.x}|${b?.y}|${innerWidth}|${innerHeight}`;
        if (a && b && key !== last) {
          last = key;
          genie?.draw(a, b, t);
        }
        show(cover, false);
        show(d, false);
        return;
      }
      last = '';
      genie?.hide();
      const swapped = canWarp ? t >= 1 : t >= 0.5;
      s.style.setProperty('--dock-t', String(canWarp ? t : Number(swapped)));
      show(cover, !swapped);
      show(d, swapped);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };

    if (!reduced && src && page.clientWidth >= WIDE) {
      genie = createGenie({
        src,
        onChange: () => {
          const box = measureBox(cover);
          if (box) genie?.prepare(box);
          schedule();
        },
      });
    }
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
      genie?.destroy();
      show(cover, true);
      show(dock.current, false); // eslint-disable-line react-hooks/exhaustive-deps -- the current node is what we hide
    };
  }, [page, cover, dock, slot, src]);
}
