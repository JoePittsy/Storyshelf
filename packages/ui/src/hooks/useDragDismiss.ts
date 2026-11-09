import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { releaseVelocity, shouldDismiss } from '../lib/dragDismiss';
import type { DragSample } from '../lib/dragDismiss';

interface Options {
  /** Off: no dragging at all (reduced motion, or a layout that isn't a sheet). */
  enabled: boolean;
  /** Called once the element has been pulled away. The caller closes it. */
  onDismiss: () => void;
  /** Things that keep their own touches: a drag that starts on one of these is theirs, unless it starts in `handle`. */
  ownTouch: string;
  /** Where a drag always starts, whatever is under the finger: a grab handle. */
  handle?: RefObject<HTMLElement | null>;
  /**
   * A scrolling box inside. A drag that starts in it only pulls the sheet down while it is scrolled to the top, and an
   * upward swipe still scrolls it, as on any phone sheet.
   */
  scroller?: RefObject<HTMLElement | null>;
}

/** A finger must move this far (px) before a drag starts, and mostly downwards, so taps and sideways scrubs pass through. */
const SLOP = 8;

interface Gesture {
  id: number;
  x: number;
  y: number;
  samples: DragSample[];
  dragging: boolean;
  /** Started inside the scroller (at its top), so an upward move is a scroll, not ours. */
  inScroller: boolean;
}

/**
 * Pull-down-to-dismiss for a sheet: the element follows the finger with `transform` and, past a distance or a flick
 * (lib/dragDismiss), slides away and calls `onDismiss`; let go sooner and it springs back. Pointer events for the drag,
 * plus a non-passive touchmove that stops the browser scrolling or rubber-banding the page once a pull has begun, so an
 * element with a scrolling body doesn't need `touch-action: none`. A tap on a row after a drag is swallowed.
 */
export function useDragDismiss(ref: RefObject<HTMLElement | null>, options: Options): void {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });
  const { enabled } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let gesture: Gesture | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let swallowClick = false;

    const atTop = (s: HTMLElement) => s.scrollTop <= 0;

    const settle = (to: string, then?: () => void) => {
      el.style.transition = 'transform var(--dur) var(--ease)';
      el.style.transform = to;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', finish);
        clearTimeout(timer);
        if (then) then();
        else {
          el.style.transition = '';
          el.style.transform = '';
        }
      };
      el.addEventListener('transitionend', finish);
      // transitionend does not fire when nothing moved or the tab is hidden.
      timer = setTimeout(finish, 350);
    };

    const down = (e: PointerEvent) => {
      if (gesture || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const { handle, ownTouch, scroller } = opts.current;
      const target = e.target instanceof Element ? e.target : null;
      const inHandle = !!target && !!handle?.current?.contains(target);
      if (!inHandle && target?.closest(ownTouch)) return;
      const box = scroller?.current;
      const inScroller = !inHandle && !!target && !!box?.contains(target);
      if (inScroller && box && !atTop(box)) return;
      gesture = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        samples: [{ y: e.clientY, t: e.timeStamp }],
        dragging: false,
        inScroller,
      };
    };

    const move = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y;
      const dx = e.clientX - g.x;
      if (!g.dragging) {
        if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
          gesture = null; // a sideways gesture belongs to whatever is under the finger
          return;
        }
        if (dy < -SLOP && g.inScroller) {
          gesture = null; // scrolling the body up
          return;
        }
        if (dy < SLOP || dy < Math.abs(dx) * 1.5) return;
        g.dragging = true;
        el.setPointerCapture?.(e.pointerId);
        clearTimeout(timer);
        el.style.transition = 'none';
      }
      g.samples.push({ y: e.clientY, t: e.timeStamp });
      if (g.samples.length > 8) g.samples.shift();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };

    const up = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      gesture = null;
      if (!g.dragging) return;
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
      const dy = e.clientY - g.y;
      const verdict = shouldDismiss({ dy, velocity: releaseVelocity(g.samples), height: el.offsetHeight });
      if (verdict) settle('translateY(100%)', () => opts.current.onDismiss());
      else settle('translateY(0)');
    };

    const cancel = () => {
      const g = gesture;
      gesture = null;
      if (g?.dragging) settle('translateY(0)');
    };

    // The browser would otherwise scroll (or rubber-band) under a downward pull and cancel the pointer. Stopped from the
    // first move, before it can start: a downward move at the top of the body, or anywhere outside it.
    const touchMove = (e: TouchEvent) => {
      const g = gesture;
      const t = e.touches[0];
      if (!g || !t || !e.cancelable) return;
      const dy = t.clientY - g.y;
      if (g.dragging || (dy > 0 && Math.abs(dy) >= Math.abs(t.clientX - g.x))) e.preventDefault();
    };

    const click = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('touchmove', touchMove, { passive: false });
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('click', click, true);
      clearTimeout(timer);
    };
  }, [ref, enabled]);
}
