import { useRef } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useDragDismiss } from '../../hooks/useDragDismiss';
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

/** Things that keep their own touches: a swipe that starts on one of these is theirs. */
const OWN_TOUCH =
  'button, a, input, select, textarea, [role="slider"], [role="progressbar"], [role="radio"], [popover]';

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
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useDragDismiss(root, { enabled: !reduced, onDismiss, ownTouch: OWN_TOUCH, handle });

  return (
    <div ref={root} className={[styles.sheet, className].filter(Boolean).join(' ')}>
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
