// The sleep timer, kept on this device so a reload doesn't drop it. One timer at a time, for one book, tied to the user
// and server it was set for (like places.ts). A minutes timer keeps what it had left: it only counts down while
// playing, and a reload leaves the book paused, so nothing needs catching up. An end-of-chapter timer keeps only that it
// was one: where it ends depends on where playback resumes, so the engine works it out again.
import { rememberedUser, serverKey } from '../api/lastUser';
import type { SleepTimer } from './sleep';

export const SLEEP_KEPT_KEY = 'storyshelf.sleepTimer';

/**
 * How long after it was last kept a timer still comes back. It is kept as the book plays (so this is time since the
 * book last played, or the timer was set or changed): long enough for a reload, a call or a break in the evening's
 * listening, short enough that the next night's, or a timer left on a book last week, doesn't turn up unasked.
 */
export const SLEEP_KEPT_MAX_AGE_MS = 4 * 60 * 60_000;

/** The longest minutes timer there can be: anything stored beyond it is junk. */
const MAX_REMAINING_MS = 24 * 60 * 60_000;

/** What comes back: a minutes timer as it was, or the fact that an end-of-chapter timer was running. */
export type KeptSleep = Extract<SleepTimer, { kind: 'minutes' }> | { kind: 'chapter' };

interface Stored {
  owner: string;
  itemId: string;
  /** ms since the epoch: when it was last kept. */
  savedAt: number;
  timer: KeptSleep;
}

const ownerKey = (): string => `${serverKey()}|${rememberedUser()?.id ?? ''}`;

/** Keeps `timer` as the one running on `itemId`. Storage that is full or blocked just means no timer after a reload. */
export function keepSleep(itemId: string, timer: SleepTimer, now = Date.now()): void {
  const kept: KeptSleep =
    timer.kind === 'chapter'
      ? { kind: 'chapter' }
      : {
          kind: 'minutes',
          remainingMs: timer.remainingMs,
          ...(timer.minutes !== undefined && { minutes: timer.minutes }),
        };
  const stored: Stored = { owner: ownerKey(), itemId, savedAt: now, timer: kept };
  try {
    localStorage.setItem(SLEEP_KEPT_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or storage blocked: the timer lasts for this page only.
  }
}

/** Drops the kept timer: it was turned off or ran out, another book started, or the user signed out. */
export function forgetKeptSleep(): void {
  try {
    localStorage.removeItem(SLEEP_KEPT_KEY);
  } catch {
    // Nothing to do: if storage can't be written, the timer isn't kept either.
  }
}

/**
 * The timer kept for `itemId` on this device, or null: none, one for another book, user or server, one kept more than
 * `SLEEP_KEPT_MAX_AGE_MS` ago (or in the future: the clock was set back), or one with nothing left. Junk is null too.
 */
export function keptSleep(itemId: string, now = Date.now()): KeptSleep | null {
  let s: Partial<Stored> | null;
  try {
    s = JSON.parse(localStorage.getItem(SLEEP_KEPT_KEY) ?? 'null') as Partial<Stored> | null;
  } catch {
    return null;
  }
  if (!s || typeof s !== 'object' || s.itemId !== itemId || s.owner !== ownerKey()) return null;
  if (typeof s.savedAt !== 'number' || !(now - s.savedAt >= 0 && now - s.savedAt <= SLEEP_KEPT_MAX_AGE_MS)) return null;
  const t = s.timer;
  if (t?.kind === 'chapter') return { kind: 'chapter' };
  if (t?.kind !== 'minutes' || typeof t.remainingMs !== 'number') return null;
  if (!(t.remainingMs > 0 && t.remainingMs <= MAX_REMAINING_MS)) return null;
  return {
    kind: 'minutes',
    remainingMs: t.remainingMs,
    ...(typeof t.minutes === 'number' && t.minutes > 0 && { minutes: t.minutes }),
  };
}
