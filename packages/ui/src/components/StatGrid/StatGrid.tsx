import type { ReactNode } from 'react';
import styles from './StatGrid.module.css';

export interface Stat {
  label: string;
  value: ReactNode;
  /** A quieter line under the value, e.g. a comparison. */
  sub?: ReactNode;
}

/** Headline figures: a muted label over a large value, as a semantic description list. Two across on a phone. */
export function StatGrid({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <dl className={[styles.grid, className].filter(Boolean).join(' ')}>
      {items.map(({ label, value, sub }) => (
        <div key={label} className={styles.stat}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{value}</dd>
          {sub != null && <dd className={styles.sub}>{sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
