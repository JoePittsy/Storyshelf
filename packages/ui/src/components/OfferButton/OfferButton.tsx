import { Moon } from 'lucide-react';
import styles from './OfferButton.module.css';

interface Props {
  /** What one tap does, in a sentence: "Go back to where the timer began, 41:10". */
  label: string;
  onClick: () => void;
  /** A glyph before the words, for what the offer is about. */
  icon?: 'moon';
  /**
   * inline: a quiet tonal pill for a page. bar: the same pill on an opaque strip with a hairline on top, to sit on the
   * mini player, its content in the app's column (it reads `--content-max` and `--gutter` like MiniPlayer).
   */
  variant?: 'inline' | 'bar';
  className?: string;
}

/**
 * A small, one-tap offer the app makes in passing, such as going back to where a sleep timer began. Quiet: the ghost
 * pill's tint, label weight, and words that wrap rather than truncate. The app decides when it shows and goes.
 */
export function OfferButton({ label, onClick, icon, variant = 'inline', className }: Props) {
  const button = (
    <button
      type="button"
      className={[styles.offer, variant === 'inline' && className].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      {icon === 'moon' && <Moon className={styles.icon} size="1.1em" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
  if (variant === 'inline') return button;
  return <div className={[styles.bar, className].filter(Boolean).join(' ')}>{button}</div>;
}
