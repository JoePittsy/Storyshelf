import { chapterIndexAt, type Chapter } from './chapters';

/** A minutes timer keeps the length it was set to, so the sleep list can tick that row while it counts down. Extending it drops that length: it no longer matches a row. */
export type SleepTimer =
  { kind: 'minutes'; remainingMs: number; minutes?: number } | { kind: 'chapter'; endsAt: number };

export function sleepInMinutes(minutes: number): SleepTimer {
  return { kind: 'minutes', remainingMs: minutes * 60_000, minutes };
}

/** Timer that ends at the end of the chapter containing t (in a gap: the next chapter start); null with no chapters. */
export function sleepAtChapterEnd(chapters: Chapter[], t: number): SleepTimer | null {
  const last = chapters[chapters.length - 1];
  if (!last) return null;
  const cur = chapters[chapterIndexAt(chapters, t)];
  return { kind: 'chapter', endsAt: cur ? cur.end : (chapters.find((c) => c.start > t)?.start ?? last.end) };
}

/** Advance by real playing ms (only called while playing). 'minutes' expires when remainingMs <= 0. 'chapter' expires when bookTime >= endsAt - 0.5. */
export function tickSleep(
  timer: SleepTimer,
  playingMs: number,
  bookTime: number
): { timer: SleepTimer; expired: boolean } {
  if (timer.kind === 'chapter') return { timer, expired: bookTime >= timer.endsAt - 0.5 };
  const remainingMs = timer.remainingMs - playingMs;
  return { timer: { ...timer, remainingMs }, expired: remainingMs <= 0 };
}

/** Real ms until the timer stops playback. An end-of-chapter timer stops half a second before the chapter end, and the speed shortens the wait. */
export function sleepRemainingMs(timer: SleepTimer, bookTime: number, rate: number): number {
  const ms =
    timer.kind === 'minutes' ? timer.remainingMs : ((timer.endsAt - 0.5 - bookTime) / Math.max(rate, 0.1)) * 1000;
  return Math.max(0, ms);
}

/** The sleep timer fades the volume out over its last 10 seconds, so it doesn't cut off mid-sentence. */
export const FADE_MS = 10_000;

/**
 * The volume, as a share of the listener's own, with `remainingMs` left on the timer: 1 until the fade starts, then
 * falling to 0. Squared, because the ear hears loudness on a log scale: a straight line would sound loud for most of
 * the fade and then drop away at the end.
 */
export function fadeLevel(remainingMs: number): number {
  if (!(remainingMs < FADE_MS)) return 1;
  const x = Math.max(0, remainingMs / FADE_MS);
  return x * x;
}
