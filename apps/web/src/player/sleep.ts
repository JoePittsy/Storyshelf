// STUB: tests-first. Behaviour is specified by sleep.test.ts. Do not edit the tests.
import type { Chapter } from './chapters';

export type SleepTimer = { kind: 'minutes'; remainingMs: number } | { kind: 'chapter'; endsAt: number };

export function sleepInMinutes(_minutes: number): SleepTimer {
  throw new Error('not implemented');
}

/** Timer that ends at the end of the chapter containing t; null with no chapters. */
export function sleepAtChapterEnd(_chapters: Chapter[], _t: number): SleepTimer | null {
  throw new Error('not implemented');
}

/** Advance by real playing ms (only called while playing). 'minutes' expires when remainingMs <= 0. 'chapter' expires when bookTime >= endsAt - 0.5. */
export function tickSleep(
  _timer: SleepTimer,
  _playingMs: number,
  _bookTime: number,
): { timer: SleepTimer; expired: boolean } {
  throw new Error('not implemented');
}
