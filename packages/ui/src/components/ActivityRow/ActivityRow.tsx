import type { MouseEvent, ReactNode } from 'react';
import { RowThumb } from '../ItemRow';
import styles from './ActivityRow.module.css';

interface Props {
  title: string;
  /** Muted line under the title, e.g. what part was heard. */
  detail?: ReactNode;
  /** Muted line after the detail on a phone, in its own column on a wide row, e.g. the device. */
  note?: ReactNode;
  /** When it happened, e.g. a time of day. Tabular. */
  when?: ReactNode;
  /** Right-aligned figure, e.g. how long. Tabular. */
  trailing?: ReactNode;
  imageUrl?: string | null;
  /** `contain` shows the whole cover over a blurred copy of itself instead of cropping it. Default `cover`. */
  artFit?: 'cover' | 'contain';
  /** false drops the thumbnail, for rows that all belong to one item. Default true. */
  showArt?: boolean;
  /** Makes the row a link. A plain click calls onOpen instead of reloading. */
  href?: string;
  /** Opens the row. Without it the row is plain text. */
  onOpen?: () => void;
}

/**
 * One entry in a log: cover, title, detail, note, time and duration. A phone stacks them in two lines; a wide row
 * lines them up in columns so a day reads as a table. Render inside a ul.
 */
export function ActivityRow({ title, detail, note, when, trailing, imageUrl, artFit = 'cover', showArt = true, href, onOpen }: Props) {
  const body = (
    <>
      {when != null && <span className={styles.when}>{when}</span>}
      {showArt && (
        <span className={styles.art}>
          <RowThumb imageUrl={imageUrl} artFit={artFit} />
        </span>
      )}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {detail != null && <span className={styles.detail}>{detail}</span>}
      </span>
      {note != null && <span className={styles.note}>{note}</span>}
      {trailing != null && <span className={styles.trailing}>{trailing}</span>}
    </>
  );
  const cls = [styles.row, !showArt && styles.noArt, when == null && styles.noWhen].filter(Boolean).join(' ');
  const click = (e: MouseEvent) => {
    if (!onOpen || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  };
  return (
    <li className={styles.item}>
      {href ? (
        <a className={`${cls} ${styles.action}`} href={href} onClick={click}>
          {body}
        </a>
      ) : onOpen ? (
        <button type="button" className={`${cls} ${styles.action}`} onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
