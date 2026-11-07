import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Check, Moon } from 'lucide-react';
import styles from '../SpeedControl/SpeedControl.module.css';
import { fmtRemaining } from '../../lib/fmtRemaining';
import { sleepLabel } from './sleep';
import type { SleepChoice, SleepValue } from './sleep';

interface Props {
  value: SleepValue;
  onChange: (choice: SleepChoice) => void;
  minuteOptions?: number[];
  /** E.g. the media has no chapters. */
  chapterOptionDisabled?: boolean;
  /** Hold the width of the longest label, so the button doesn't resize (and shove its neighbours) as the label changes. */
  stableWidth?: boolean;
  /**
   * Icon only while the timer is off (the name stays "Sleep timer"); the time shows once it is set. A chapter timer
   * shows its time left when it gives one, since "End of chapter" is too wide for a tray cell, else the words.
   */
  compact?: boolean;
  className?: string;
}

/** One row of the list: its words, then a tick when it is the current choice, so the choice never rests on weight alone. */
function Option({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={styles.option} aria-pressed={on} disabled={disabled} onClick={onClick}>
      {children}
      {on && <Check className={styles.tick} size="1.1em" aria-hidden="true" />}
    </button>
  );
}

/**
 * A moon button showing the timer's state, opening a native popover: "End of chapter" first (the bedtime choice), then
 * the minute options, then "Off". The current choice is ticked. Choosing one calls onChange and closes the popover.
 * Esc and outside click close it too, and focus returns to the button.
 */
export function SleepTimerControl({
  value,
  onChange,
  minuteOptions = [15, 30, 45, 60],
  chapterOptionDisabled,
  stableWidth,
  compact,
  className,
}: Props) {
  const id = useId();
  const pop = useRef<HTMLDivElement>(null);
  const label = sleepLabel(value);
  const shown =
    compact && value?.kind === 'chapter' && value.remainingMs !== undefined ? fmtRemaining(value.remainingMs) : label;
  const pick = (choice: SleepChoice) => {
    onChange(choice);
    pop.current?.hidePopover?.();
  };
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.trigger}
        popoverTarget={id}
        aria-label={value ? `Sleep timer, ${label}${shown === label ? '' : `, ${shown}`}` : 'Sleep timer'}
      >
        <Moon size="1.2em" aria-hidden="true" />
        {!(compact && !value) && (
          <span className={styles.label} aria-hidden="true">
            <span>{shown}</span>
            {/* Invisible, stacked in the same cell: the cell is as wide as the widest label. */}
            {stableWidth && <span className={styles.sizer}>{sleepLabel({ kind: 'chapter' })}</span>}
          </span>
        )}
      </button>
      <div id={id} ref={pop} popover="auto" className={styles.pop} role="group" aria-label="Sleep timer">
        <div className={styles.menu}>
          <Option on={value?.kind === 'chapter'} disabled={chapterOptionDisabled} onClick={() => pick('chapter')}>
            End of chapter
          </Option>
          {minuteOptions.map((m) => (
            <Option key={m} on={value?.kind === 'minutes' && value.minutes === m} onClick={() => pick({ minutes: m })}>
              {m} minutes
            </Option>
          ))}
          <Option on={!value} onClick={() => pick('off')}>
            Off
          </Option>
        </div>
      </div>
    </span>
  );
}
