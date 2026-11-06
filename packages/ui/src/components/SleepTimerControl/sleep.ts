import { fmtRemaining } from '../../lib/fmtRemaining';

/** The running timer: null when off, minutes counting down, or until the chapter ends. */
export type SleepValue = null | { kind: 'minutes'; remainingMs: number } | { kind: 'chapter' };
/** What the person picked. */
export type SleepChoice = 'off' | 'chapter' | { minutes: number };

/** "Sleep" when off, "12:30" while counting down, "End of chapter" for a chapter timer. */
export function sleepLabel(value: SleepValue): string {
  if (!value) return 'Sleep';
  return value.kind === 'chapter' ? 'End of chapter' : fmtRemaining(value.remainingMs);
}
