import { Fragment, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Not selectable. */
  disabled?: boolean;
  /** Why it is disabled: shown as a tooltip and read out as the option's description. */
  reason?: string;
}

interface Props<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
}

/**
 * A small radio group drawn as joined segments. One tab stop (the selected segment); the arrow keys move to
 * the next enabled one and select it. A disabled option stays visible and says why.
 */
export function SegmentedControl<T extends string>({ label, value, onChange, options, className }: Props<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const from = options.findIndex((o) => o.value === value);
    for (let step = 1; step <= options.length; step++) {
      const i = (((from + dir * step) % options.length) + options.length) % options.length;
      const o = options[i];
      if (o && !o.disabled) {
        onChange(o.value);
        refs.current[i]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={[styles.group, className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <Fragment key={o.value}>
          <button
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            className={styles.seg}
            aria-checked={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            disabled={o.disabled}
            title={o.disabled ? o.reason : undefined}
            aria-describedby={o.disabled && o.reason ? `${id}-${o.value}` : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
          {/* Outside the button, so the reason describes the option and never becomes part of its name. */}
          {o.disabled && o.reason && (
            <span id={`${id}-${o.value}`} className={styles.srOnly}>
              {o.reason}
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
