import { useId, useRef, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import styles from './SearchField.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** The accessible name. Visually hidden; the icon and placeholder carry the meaning on screen. */
  label: string;
  placeholder?: string;
  /** Called with the current value on Enter. */
  onSubmit?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/** A native search input with a leading icon and a clear button. Esc or the button clears and keeps focus in the input. */
export function SearchField({ value, onChange, label, placeholder, onSubmit, disabled, className }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  const clear = () => {
    onChange('');
    input.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && value) {
      e.preventDefault();
      e.stopPropagation(); // do not also close a dialog this sits in
      clear();
    } else if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit(value);
    }
  };

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.hidden}>
        {label}
      </label>
      <Search className={styles.icon} aria-hidden="true" size="1.1em" />
      <input
        ref={input}
        id={id}
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        enterKeyHint="search"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {value && !disabled && (
        <button type="button" className={styles.clear} aria-label="Clear search" onClick={clear}>
          <X aria-hidden="true" size="1.1em" />
        </button>
      )}
    </div>
  );
}
