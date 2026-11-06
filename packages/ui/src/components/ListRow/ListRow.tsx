import type { ReactNode } from 'react';
import styles from './ListRow.module.css';

interface Props {
  /** Muted position figure before the title, e.g. a chapter number. Tabular, fixed width. */
  lead?: ReactNode;
  title: string;
  /** Muted figure after the title, e.g. a start time. Tabular. */
  aside?: ReactNode;
  /** Right-aligned figure at the end, e.g. a duration. Tabular. */
  trailing?: ReactNode;
  /** Drops the aside under 40em, so a phone gives the width to the title (the trailing figure stays). */
  asideWideOnly?: boolean;
  /** Marks the row as the current one: highlighted, and `aria-current="true"` for assistive tech. */
  current?: boolean;
  onClick: () => void;
}

/** A selectable row: a full-width button with a title and up to two right-aligned figures. Render inside a ul. */
export function ListRow({ lead, title, aside, asideWideOnly, trailing, current, onClick }: Props) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.row}${current ? ' ' + styles.current : ''}`}
        aria-current={current ? 'true' : undefined}
        onClick={onClick}
      >
        {lead != null && <span className={`${styles.figure} ${styles.lead}`}>{lead}</span>}
        <span className={styles.title}>{title}</span>
        {aside != null && (
          <span className={`${styles.figure}${asideWideOnly ? ' ' + styles.wideOnly : ''}`}>{aside}</span>
        )}
        {trailing != null && <span className={`${styles.figure} ${styles.trailing}`}>{trailing}</span>}
      </button>
    </li>
  );
}
