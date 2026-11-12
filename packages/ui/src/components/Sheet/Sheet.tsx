import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useDragDismiss } from '../../hooks/useDragDismiss';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Dialog } from '../Dialog';
import { PillButton } from '../PillButton';
import styles from './Sheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sentence case. Names the sheet for screen readers too. */
  title: string;
  /** A primary button at the bottom that closes the sheet, within thumb reach (the close icon sits at the top right). */
  doneLabel?: string;
  /** `ghost` when the sheet's body has its own primary action, so the view keeps to one primary. Default `primary`. */
  doneVariant?: 'primary' | 'ghost';
  children: ReactNode;
}

/**
 * A bottom sheet on narrow screens, a centred panel on wide ones. It is the Dialog (a native <dialog> opened with
 * showModal(): inert page behind, Esc, a backdrop click and the browser's Back close it, focus returns to the opener) restyled, with
 * a scrolling body. Popovers inside it open in the top layer, so the sheet cannot clip them.
 *
 * As a bottom sheet it has a grab bar and pulls down to close: from the bar, the title row, or the body while the body
 * is scrolled to the top (an upward swipe still scrolls it). A swipe that starts on a slider or a field is theirs.
 */
export function Sheet({ open, onClose, title, doneLabel, doneVariant = 'primary', children }: Props) {
  if (!open) return null;
  return (
    <SheetDialog title={title} onClose={onClose} doneLabel={doneLabel} doneVariant={doneVariant}>
      {children}
    </SheetDialog>
  );
}

/** Things that keep their own touches inside a sheet. Rows and buttons don't: a pull that starts on one still closes. */
const OWN_TOUCH = 'input, select, textarea, [role="slider"], [popover]';

// Its own component, so the drag is only wired while the sheet is open.
function SheetDialog({ onClose, title, doneLabel, doneVariant, children }: Omit<Props, 'open'>) {
  const root = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // Sheet.module.css's bottom-sheet width, and no dragging under reduced motion (the close button still works).
  const bottom = useMediaQuery('(max-width: 39.99em)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  useDragDismiss(root, { enabled: bottom && !reduced, onDismiss: onClose, ownTouch: OWN_TOUCH, scroller: body });
  return (
    <Dialog
      title={title}
      onClose={onClose}
      size="md"
      className={styles.sheet}
      rootRef={root}
      bodyRef={body}
      actions={
        doneLabel ? (
          <PillButton variant={doneVariant} onClick={onClose}>
            {doneLabel}
          </PillButton>
        ) : undefined
      }
    >
      {children}
    </Dialog>
  );
}
