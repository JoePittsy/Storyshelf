import { useId, useRef } from 'react';
import { Ellipsis } from 'lucide-react';
import styles from './MoreMenu.module.css';

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  /** A place- or data-losing action: tonal red text. */
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  /** The button's accessible name, and the panel's: "More actions", "More for The Hobbit". */
  label: string;
  items: MoreMenuItem[];
  /** The work started by an item is still running: the button says so (aria-busy). */
  busy?: boolean;
  /** `ghost` (default): the tonal circle beside a primary pill. `quiet`: no fill until hovered, in tertiary label, for a tile's caption. */
  variant?: 'ghost' | 'quiet';
  className?: string;
}

/**
 * The overflow for a surface's secondary actions: a quiet round button (…) that opens a native popover of labelled
 * rows. A disclosure, not an ARIA menu, like the sleep timer's options: the rows are ordinary buttons in the tab order.
 * The popover is in the top layer, closes on Esc and outside click, returns focus to the button, and is placed under the
 * button with CSS anchor positioning, flipping to stay on screen. Choosing a row closes it, then calls `onSelect`.
 */
export function MoreMenu({ label, items, busy, variant = 'ghost', className }: Props) {
  const id = useId();
  const pop = useRef<HTMLDivElement>(null);
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={[styles.trigger, variant === 'quiet' && styles.quiet].filter(Boolean).join(' ')}
        popoverTarget={id}
        aria-label={label}
        aria-busy={busy || undefined}
      >
        <Ellipsis size="1.3em" aria-hidden="true" />
      </button>
      <div id={id} ref={pop} popover="auto" className={styles.pop} role="group" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={[styles.item, item.danger && styles.danger].filter(Boolean).join(' ')}
            disabled={item.disabled}
            onClick={() => {
              pop.current?.hidePopover?.();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </span>
  );
}
