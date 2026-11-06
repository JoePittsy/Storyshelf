import type { ReactNode } from 'react';
import styles from './TopBar.module.css';

interface Props {
  /** Left: usually the app name. */
  start?: ReactNode;
  /** Middle: takes the spare width, e.g. a search field. */
  centre?: ReactNode;
  /** Right: menus and account controls. */
  end?: ReactNode;
  className?: string;
}

/** A sticky frosted header with start, centre and end slots. It sits clear of the iPhone notch. */
export function TopBar({ start, centre, end, className }: Props) {
  return (
    <header className={[styles.bar, className].filter(Boolean).join(' ')}>
      <div className={styles.start}>{start}</div>
      <div className={styles.centre}>{centre}</div>
      <div className={styles.end}>{end}</div>
    </header>
  );
}
