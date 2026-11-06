import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import styles from './ActionRow.module.css';

const ICONS = { rename: Pencil, delete: Trash2 } as const;

export interface RowAction {
  icon: keyof typeof ICONS;
  /** The accessible name, which should name the row too: "Rename Chapter 3", not "Rename". */
  label: string;
  onClick: () => void;
}

interface Props {
  title: string;
  /** Muted line under the title, e.g. the chapter. */
  detail?: ReactNode;
  /** Right-aligned figure, e.g. a time. Tabular. */
  trailing?: ReactNode;
  /** Opens (or goes to) the row's item. */
  onOpen: () => void;
  /** Icon buttons after the row, always visible, so a phone can reach them. */
  actions: RowAction[];
}

/**
 * A row that opens something, with its own icon actions at the end (rename, delete): the open button takes the
 * title, detail and figure, and each action is a separate 44px button beside it. Render inside a ul.
 */
export function ActionRow({ title, detail, trailing, onOpen, actions }: Props) {
  return (
    <li className={styles.item}>
      <button type="button" className={styles.open} onClick={onOpen}>
        {/* The spaces keep the parts apart in the button's name; the flex layout doesn't render them. */}
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>{' '}
          {detail != null && <span className={styles.detail}>{detail}</span>}
        </span>{' '}
        {trailing != null && <span className={styles.trailing}>{trailing}</span>}
      </button>
      {actions.length > 0 && (
        <span className={styles.actions}>
          {actions.map((a) => {
            const Icon = ICONS[a.icon];
            return (
              <button
                key={a.icon}
                type="button"
                className={`${styles.action} ${styles[a.icon]}`}
                onClick={a.onClick}
                aria-label={a.label}
                title={a.label}
              >
                <Icon size="1.15em" aria-hidden="true" />
              </button>
            );
          })}
        </span>
      )}
    </li>
  );
}
