import { useEffect, useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { releaseVelocity, shouldDismiss } from '../../lib/dragDismiss';
import type { DragSample } from '../../lib/dragDismiss';
import styles from './GrabSheet.module.css';

interface Props {
  /** Called once the sheet has been swiped away, or when the chevron is pressed. The caller closes it (e.g. navigates back). */
  onDismiss: () => void;
  /** Accessible name of the chevron button, e.g. "Close player". It is the way out for anyone who can't swipe. */
  closeLabel: string;
  /** Sits opposite the chevron, at the top right. */
  end?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A finger must move this far (px) before a drag starts, and mostly downwards, so taps and sideways scrubs pass through. */
const SLOP = 8;
/** Things that keep their own touches: a swipe that starts on one of these is theirs. */
const OWN_TOUCH = 'button, a, input, select, textarea, [role="slider"], [role="progressbar"], [role="radio"], [popover]';

/**
 * The shell of a full-height sheet: a grab handle and a chevron-down button along the top, and the content below.
 * Dragging it down (from the handle or any non-interactive part) moves it with the finger and, past a distance or
 * a flick, calls `onDismiss`; let go sooner and it springs back. Pointer events and `transform` only. Under reduced
 * motion there is no dragging at all; the chevron still works. The caller positions and sizes the sheet and gives
 * it a background; `touch-action: none` here stops the browser stealing the drag.
 */
export function GrabSheet({ onDismiss, closeLabel, end, className, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; samples: DragSample[]; dragging: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = (to: string, then?: () => void) => {
    const el = root.current;
    if (!el) return;
    el.style.transition = 'transform var(--dur) var(--ease)';
    el.style.transform = to;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', finish);
      clearTimeout(timer.current);
      if (then) then();
      else {
        el.style.transition = '';
        el.style.transform = '';
      }
    };
    el.addEventListener('transitionend', finish);
    // transitionend does not fire when nothing moved or the tab is hidden.
    timer.current = setTimeout(finish, 350);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced || gesture.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = e.target instanceof Element ? e.target : null;
    const inHandle = !!target && !!handle.current?.contains(target);
    if (!inHandle && target?.closest(OWN_TOUCH)) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }], dragging: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const el = root.current;
    if (!g || !el || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y;
    const dx = e.clientX - g.x;
    if (!g.dragging) {
      if (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy)) {
        gesture.current = null; // a sideways gesture belongs to whatever is under the finger
        return;
      }
      if (dy < SLOP || dy < Math.abs(dx) * 1.5) return;
      g.dragging = true;
      el.setPointerCapture?.(e.pointerId);
      clearTimeout(timer.current);
      el.style.transition = 'none';
    }
    g.samples.push({ y: e.clientY, t: e.timeStamp });
    if (g.samples.length > 8) g.samples.shift();
    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const el = root.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    if (!g.dragging || !el) return;
    const dy = e.clientY - g.y;
    const verdict = shouldDismiss({ dy, velocity: releaseVelocity(g.samples), height: el.offsetHeight });
    if (verdict) settle('translateY(100%)', onDismiss);
    else settle('translateY(0)');
  };
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.dragging) settle('translateY(0)');
  };

  return (
    <div
      ref={root}
      className={[styles.sheet, className].filter(Boolean).join(' ')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
    >
      <div className={styles.head}>
        <button type="button" className={styles.close} onClick={onDismiss} aria-label={closeLabel} title={closeLabel}>
          <ChevronDown size="1.6em" aria-hidden="true" />
        </button>
        <div ref={handle} className={styles.grab} aria-hidden="true">
          <span className={styles.bar} />
        </div>
        <div className={styles.end}>{end}</div>
      </div>
      {children}
    </div>
  );
}
