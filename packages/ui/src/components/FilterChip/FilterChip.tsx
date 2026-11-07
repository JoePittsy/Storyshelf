import { X } from 'lucide-react';
import styles from './FilterChip.module.css';

interface Props {
  /** What is applied, e.g. "Fantasy" or "Progress: In progress". */
  label: string;
  /** Called when the chip's remove button is pressed. */
  onRemove: () => void;
  /** Accessible name of the remove button. Default "Remove filter: {label}". */
  removeLabel?: string;
}

/** An applied filter: a tonal pill with its label and a remove button. Sized in em. */
export function FilterChip({ label, onRemove, removeLabel }: Props) {
  return (
    <span className={styles.chip}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={styles.remove}
        aria-label={removeLabel ?? `Remove filter: ${label}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" size="1em" />
      </button>
    </span>
  );
}
