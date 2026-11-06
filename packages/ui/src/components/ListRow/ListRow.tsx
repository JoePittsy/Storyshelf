import type { ReactNode } from 'react';
import styles from './ListRow.module.css';

interface Props {
  title: string;
  /** Muted figure after the title, e.g. a start time. Tabular. */
  aside?: ReactNode;
  /** Right-aligned figure at the end, e.g. a duration. Tabular. */
  trailing?: ReactNode;
  /** Marks the row as the current one: highlighted, and `aria-current="true"` for assistive tech. */
  current?: boolean;
  onClick: () => void;
}

/** A selectable row: a full-width button with a title and up to two right-aligned figures. Render inside a ul. */
export function ListRow({ title, aside, trailing, current, onClick }: Props) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.row}${current ? ' ' + styles.current : ''}`}
        aria-current={current ? 'true' : undefined}
        onClick={onClick}
      >
        <span className={styles.title}>{title}</span>
        {aside != null && <span className={styles.figure}>{aside}</span>}
        {trailing != null && <span className={`${styles.figure} ${styles.trailing}`}>{trailing}</span>}
      </button>
    </li>
  );
}
