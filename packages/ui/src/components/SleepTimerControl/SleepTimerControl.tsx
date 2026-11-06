import { useId, useRef } from 'react';
import { Moon } from 'lucide-react';
import styles from '../SpeedControl/SpeedControl.module.css';
import { sleepLabel } from './sleep';
import type { SleepChoice, SleepValue } from './sleep';

interface Props {
  value: SleepValue;
  onChange: (choice: SleepChoice) => void;
  minuteOptions?: number[];
  /** E.g. the media has no chapters. */
  chapterOptionDisabled?: boolean;
  className?: string;
}

/**
 * A moon button showing the timer's state, opening a native popover of options plus "Off". Choosing one calls
 * onChange and closes the popover. Esc and outside click close it too, and focus returns to the button.
 */
export function SleepTimerControl({
  value,
  onChange,
  minuteOptions = [5, 10, 15, 30, 45, 60],
  chapterOptionDisabled,
  className,
}: Props) {
  const id = useId();
  const pop = useRef<HTMLDivElement>(null);
  const label = sleepLabel(value);
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
        aria-label={value ? `Sleep timer, ${label}` : 'Sleep timer'}
      >
        <Moon size="1.2em" aria-hidden="true" />
        <span aria-hidden="true">{label}</span>
      </button>
      <div id={id} ref={pop} popover="auto" className={styles.pop} role="group" aria-label="Sleep timer">
        <div className={styles.menu}>
          {minuteOptions.map((m) => (
            <button key={m} type="button" className={styles.option} onClick={() => pick({ minutes: m })}>
              {m} minutes
            </button>
          ))}
          <button
            type="button"
            className={styles.option}
            aria-pressed={value?.kind === 'chapter'}
            disabled={chapterOptionDisabled}
            onClick={() => pick('chapter')}
          >
            End of chapter
          </button>
          <button type="button" className={styles.option} aria-pressed={!value} onClick={() => pick('off')}>
            Off
          </button>
        </div>
      </div>
    </span>
  );
}
