import type { InProgressItem } from '../api/history';
import { mergeProgress } from '../api/libraries';
import type { Progress, Tile } from '../api/libraries';
import { fmtLong } from '../screens/bookHelpers';

/**
 * This library's unfinished books, most recently played first (ABS has already sorted them). ABS lists hidden ones
 * too, other libraries' and podcasts; none of those belong on the Books home.
 */
export function continueBooks(
  inProgress: InProgressItem[] | undefined,
  progress: Map<string, Progress>,
  libraryId: string
): Tile[] {
  const items = (inProgress ?? []).filter(
    (i) => i.mediaType === 'book' && i.libraryId === libraryId && !progress.get(i.id)?.hidden
  );
  return mergeProgress(items, progress);
}

/** The book to resume (the most recently played) and the rest, for the shelf. */
export function splitResume(tiles: Tile[]): { hero: Tile | undefined; rest: Tile[] } {
  return { hero: tiles[0], rest: tiles.slice(1) };
}

interface Where {
  /** Seconds. 0 when unknown. */
  duration: number;
  /** Seconds into the book. */
  currentTime: number;
  chapters: { start: number; end: number }[];
  /** From the player when it has the book loaded; otherwise found from the chapters. */
  chapterIndex?: number;
}

/** "Chapter 3 of 12 · 4h 12m left": whichever parts are known. Empty when neither is. */
export function resumeStatus({ duration, currentTime, chapters, chapterIndex }: Where): string {
  const parts: string[] = [];
  const at = chapterIndex ?? chapters.findIndex((c) => currentTime >= c.start && currentTime < c.end);
  if (chapters.length > 0 && at >= 0) parts.push(`Chapter ${at + 1} of ${chapters.length}`);
  if (duration > 0) {
    const left = Math.max(0, duration - currentTime);
    parts.push(left < 60 ? 'Under a minute left' : `${fmtLong(left)} left`);
  }
  return parts.join(' · ');
}
