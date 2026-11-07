import { fmtRemaining } from '../../lib/fmtRemaining';

/**
 * The running timer: null when off, minutes counting down, or until the chapter ends. A minutes timer that says how
 * long it was set for (`minutes`) gets that row ticked in the list. A chapter timer may say how long is left
 * (`remainingMs`), which a compact trigger shows in place of the words.
 */
export type SleepValue =
  null | { kind: 'minutes'; remainingMs: number; minutes?: number } | { kind: 'chapter'; remainingMs?: number };
/** What the person picked. */
export type SleepChoice = 'off' | 'chapter' | { minutes: number };

/** "Sleep" when off, "12:30" while counting down, "End of chapter" for a chapter timer. */
export function sleepLabel(value: SleepValue): string {
  if (!value) return 'Sleep';
  return value.kind === 'chapter' ? 'End of chapter' : fmtRemaining(value.remainingMs);
}
