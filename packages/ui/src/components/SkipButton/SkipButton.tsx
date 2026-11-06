import { RotateCcw, RotateCw } from 'lucide-react';
import styles from './SkipButton.module.css';

interface Props {
  direction: 'back' | 'forward';
  /** How far it skips; shown inside the arrow and spoken in the label. */
  seconds: number;
  onClick: () => void;
  size?: 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

/** A circular arrow with the seconds inside it: "Back 30 seconds" / "Forward 30 seconds". Sized in em. */
export function SkipButton({ direction, seconds, onClick, size = 'md', disabled, className }: Props) {
  const Arrow = direction === 'back' ? RotateCcw : RotateCw;
  const label = `${direction === 'back' ? 'Back' : 'Forward'} ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  return (
    <button
      type="button"
      className={[styles.skip, styles[size], className].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Arrow className={styles.arrow} size="100%" strokeWidth={1.6} aria-hidden="true" />
      <span className={styles.seconds} aria-hidden="true">
        {seconds}
      </span>
    </button>
  );
}
