import type { ReactNode } from 'react';
import styles from './DetailList.module.css';

export interface DetailItem {
  label: string;
  value: ReactNode;
}

interface Props {
  items: DetailItem[];
  className?: string;
}

/** Label and value pairs as a semantic description list: a muted label over its value. Pass only the pairs you have. */
export function DetailList({ items, className }: Props) {
  return (
    <dl className={[styles.list, className].filter(Boolean).join(' ')}>
      {items.map(({ label, value }) => (
        <div key={label} className={styles.pair}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
