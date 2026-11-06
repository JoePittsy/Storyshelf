import type { ReactNode } from 'react';
import { Dialog } from '../Dialog';
import styles from './Sheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Sentence case. Names the sheet for screen readers too. */
  title: string;
  children: ReactNode;
}

/**
 * A bottom sheet on narrow screens, a centred panel on wide ones. It is the Dialog (a native <dialog> opened with
 * showModal(): inert page behind, Esc and a backdrop click close it, focus returns to the opener) restyled, with
 * a scrolling body. Popovers inside it open in the top layer, so the sheet cannot clip them.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  if (!open) return null;
  return (
    <Dialog title={title} onClose={onClose} size="md" className={styles.sheet}>
      {children}
    </Dialog>
  );
}
