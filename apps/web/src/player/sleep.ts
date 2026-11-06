import { chapterIndexAt, type Chapter } from './chapters';

export type SleepTimer = { kind: 'minutes'; remainingMs: number } | { kind: 'chapter'; endsAt: number };

export function sleepInMinutes(minutes: number): SleepTimer {
  return { kind: 'minutes', remainingMs: minutes * 60_000 };
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
  bookTime: number,
): { timer: SleepTimer; expired: boolean } {
  if (timer.kind === 'chapter') return { timer, expired: bookTime >= timer.endsAt - 0.5 };
  const remainingMs = timer.remainingMs - playingMs;
  return { timer: { kind: 'minutes', remainingMs }, expired: remainingMs <= 0 };
}
