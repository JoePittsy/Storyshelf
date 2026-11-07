import { fmtLong } from '../screens/bookHelpers';
import { dayKey } from '../screens/historyHelpers';

const DAY_MS = 86_400_000;
/**
 * How far ahead of this device's clock a start time may be and still be believed. ABS can create the progress record
 * at the very end (a short listen never reached a periodic sync), a moment after the card read the clock, and the
 * server's clock may run a little ahead.
 */
const SKEW_MS = 5 * 60_000;

/**
 * The Finished card's line: the book's length and the calendar days from the first listen (ABS progress `startedAt`)
 * to now, as "1h 3m over 4 days", or "45m in one day". Each part is left out when it isn't known (no length, a book
 * under a minute, no start time, or one well after now), so nothing is guessed; undefined when neither is known.
 * `tz` is for tests: left out, days are the device's own.
 */
export function finishedLine(
  durationSec: number,
  startedAt: number | null | undefined,
  now: number,
  tz?: string
): string | undefined {
  const length = durationSec >= 60 ? fmtLong(durationSec) : null;
  const known = !!startedAt && startedAt > 0 && startedAt <= now + SKEW_MS;
  const end = known ? Math.max(now, startedAt) : now;
  // Both days at noon UTC, so the difference is a whole number of days whatever the clocks did in between.
  const days = known
    ? Math.round(
        (Date.parse(`${dayKey(end, tz)}T12:00:00Z`) - Date.parse(`${dayKey(startedAt, tz)}T12:00:00Z`)) / DAY_MS
      ) + 1
    : null;
  const span = days === null ? null : days === 1 ? 'in one day' : `over ${days} days`;
  if (length && span) return `${length} ${span}`;
  if (length) return length;
  if (span) return span[0].toUpperCase() + span.slice(1);
  return undefined;
}
