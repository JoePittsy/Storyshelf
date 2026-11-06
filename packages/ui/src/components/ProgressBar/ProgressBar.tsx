import { Check } from 'lucide-react';
import styles from './ProgressBar.module.css';

interface Props {
  /** 0 to 1; clamped. */
  value: number;
  /** The accessible name, e.g. "Progress through The Hobbit". */
  label: string;
  /** inline: a bar in the flow. overlay: pinned to the bottom edge of a positioned artwork tile. */
  variant?: 'inline' | 'overlay';
  /** Draw the empty track at 0; by default nothing shows. */
  showEmpty?: boolean;
  className?: string;
}

/** A thin bar for how far through something is. At 1 it also shows a check, so "finished" never relies on colour. */
export function ProgressBar({ value, label, variant = 'inline', showEmpty, className }: Props) {
  const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  if (fraction === 0 && !showEmpty) return null;
  const percent = Math.round(fraction * 100);
  const done = fraction === 1;
  return (
    <div className={[styles.root, styles[variant], done && styles.done, className].filter(Boolean).join(' ')}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% complete`}
        className={styles.track}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      {done && <Check className={styles.check} aria-hidden="true" size="1em" strokeWidth={3} />}
    </div>
  );
}
