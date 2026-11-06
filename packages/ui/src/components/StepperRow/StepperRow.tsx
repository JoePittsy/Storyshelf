import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './StepperRow.module.css';

interface Props {
  /** The current item's name, truncated to one line. Pressing it calls `onOpen` (e.g. to open the list). */
  title: string;
  /** Small text after the title (e.g. "7 of 28"), for when the title alone doesn't say where you are. */
  count?: string;
  /** Read out after the title and count, unseen: what pressing it does, and where you are if the count doesn't say (", track 7 of 28. Opens the chapter list"). Keeps the visible text inside the accessible name. */
  hint: string;
  onOpen: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
}

/** A previous button, the current item's title and a next button on one row. 44px targets. Sized in em. */
export function StepperRow({
  title,
  count,
  hint,
  onOpen,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  previousDisabled,
  nextDisabled,
  className,
}: Props) {
  return (
    <div className={[styles.row, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.step}
        onClick={onPrevious}
        disabled={previousDisabled}
        aria-label={previousLabel}
        title={previousLabel}
      >
        <ChevronLeft size="1.5em" aria-hidden="true" />
      </button>
      <button type="button" className={styles.title} onClick={onOpen}>
        <span className={styles.text}>{title}</span>
        {count && <span className={styles.count}>{count}</span>}
        <span className={styles.srOnly}>{hint}</span>
      </button>
      <button
        type="button"
        className={styles.step}
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <ChevronRight size="1.5em" aria-hidden="true" />
      </button>
    </div>
  );
}
