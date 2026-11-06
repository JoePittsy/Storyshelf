import { useId } from 'react';
import type { InputHTMLAttributes, Ref } from 'react';
import styles from './TextField.module.css';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** Always visible, sentence case. */
  label: string;
  /** Helper text under the field. */
  hint?: string;
  /** Error message; marks the field invalid and is announced with it. */
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

/** A labelled text input. Native input props (type, autoComplete, name, required...) and the ref go to the input. */
export function TextField({ label, hint, error, id, ref, ...rest }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [rest['aria-describedby'], hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
