import type { PlayerState } from './engine';

/** The part of the player's state that decides what is said. */
export type Heard = Pick<PlayerState, 'status' | 'item' | 'rate' | 'sleep' | 'position' | 'ended'>;

/** How close to its end a sleep timer must be for its disappearing to count as running out, not being turned off. */
const EXPIRY_WINDOW_S = 2;

/** "1", "1.25", "1.5": the speed without trailing zeros. */
const fmtRate = (rate: number): string => String(Number(rate.toFixed(2)));

function sleepLength(t: NonNullable<Heard['sleep']>): string {
  if (t.kind === 'chapter') return 'c';
  // Not the countdown: that changes every tick. A timer that never said its length counts as one length.
  return `m${t.minutes ?? ''}`;
}

function sleepWords(t: NonNullable<Heard['sleep']>): string {
  if (t.kind === 'chapter') return 'end of chapter';
  const m = t.minutes ?? Math.round(t.remainingMs / 60_000);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** The timer has run down to its end: it went away on its own, which is not the listener turning it off. */
function ranOut(timer: NonNullable<Heard['sleep']>, position: number): boolean {
  return timer.kind === 'minutes'
    ? timer.remainingMs <= EXPIRY_WINDOW_S * 1000
    : position >= timer.endsAt - EXPIRY_WINDOW_S;
}

/**
 * What a screen reader should be told about the player moving from `prev` to `next`, or null for nothing. `prev.status`
 * is the last one that was playing or paused, so loading (which a resume or a reload passes through) says nothing
 * and a reload mid-play doesn't announce "Playing" again. Seeks and skips are left to the seek bar's own value, and a
 * chapter jump has its toast.
 * - playing: "Playing {title}" for a book that has not played yet this visit, "Playing" when it carries on
 * - paused: "Paused", including when the sleep timer paused it (its offer to go back is not a live region)
 * - the listener's speed change on the same book (another book's own remembered speed is not theirs): "Speed 1.25×"
 * - the sleep timer set, changed (another length) or turned off by the listener, but not its countdown or its running out
 * `lastPlayedId` is the book that last played, to tell a first start from a resume.
 */
export function playerAnnouncement(prev: Heard, next: Heard, lastPlayedId: string | null): string | null {
  const sameBook = !!next.item && prev.item?.id === next.item.id;
  if (next.status === 'playing' && prev.status !== 'playing')
    return next.item && next.item.id !== lastPlayedId ? `Playing ${next.item.title}` : 'Playing';
  if (next.status === 'paused' && prev.status === 'playing' && !next.ended) return 'Paused';
  if (!sameBook) return null;
  if (next.rate !== prev.rate) return `Speed ${fmtRate(next.rate)}×`;
  const was = prev.sleep;
  const now = next.sleep;
  if (now) {
    const changed =
      !was ||
      sleepLength(was) !== sleepLength(now) ||
      (was.kind === 'chapter' && now.kind === 'chapter' && was.endsAt !== now.endsAt) ||
      // The same length picked again starts it over.
      (was.kind === 'minutes' && now.kind === 'minutes' && now.remainingMs > was.remainingMs);
    return changed ? `Sleep timer: ${sleepWords(now)}` : null;
  }
  if (was && !ranOut(was, prev.position)) return 'Sleep timer off';
  return null;
}
