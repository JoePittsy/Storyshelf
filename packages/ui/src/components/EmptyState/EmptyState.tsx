import type { ComponentType, ReactNode, SVGProps } from 'react';
import styles from './EmptyState.module.css';

interface Props {
  /** A lucide icon component. Decorative. */
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>;
  title: string;
  /** A sentence of explanation. */
  children?: ReactNode;
  /** What to do next, e.g. a PillButton. */
  action?: ReactNode;
  className?: string;
}

/** A quiet, centred note for a view with nothing to show. */
export function EmptyState({ icon: Icon, title, children, action, className }: Props) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {Icon && <Icon className={styles.icon} aria-hidden="true" size="2.4em" strokeWidth={1.5} />}
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.message}>{children}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
