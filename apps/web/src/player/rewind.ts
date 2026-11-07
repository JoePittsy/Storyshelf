import { chapterIndexAt, type Chapter } from './chapters';

/**
 * How far back to go, in book seconds, when playback resumes after a pause of `pauseMs`:
 *
 * - under 10 s: nothing. A quick pause (a word from someone, a road to cross) loses no thread.
 * - 10 s to 5 min: 5 s, about a sentence, to hear the thought you stopped in.
 * - 5 min to 1 h: 15 s, a paragraph or so.
 * - 1 h or more (overnight, the next commute): 30 s, the cap. Further than that is a job for the chapter list or the
 *   "fell asleep" offer, not a surprise.
 *
 * Book seconds, not real ones: it is the story you need back, whatever the speed. A pause it can't measure gets nothing.
 */
export function rewindSeconds(pauseMs: number): number {
  if (!(pauseMs >= 10_000)) return 0;
  if (pauseMs < 5 * 60_000) return 5;
  if (pauseMs < 60 * 60_000) return 15;
  return REWIND_CAP_SECONDS;
}

/** The most the rewind ever goes back. */
export const REWIND_CAP_SECONDS = 30;

/**
 * Where to resume from `position` after rewinding `seconds`: never before the start of the chapter it is in (a new
 * chapter is a natural place to begin, and the last one's closing lines would be a jolt), and never before 0. In a gap
 * between chapters, never before the gap starts.
 */
export function rewindTarget(position: number, seconds: number, chapters: Chapter[]): number {
  if (seconds <= 0) return position;
  const cur = chapters[chapterIndexAt(chapters, position)];
  const floor = cur ? cur.start : Math.max(0, ...chapters.filter((c) => c.end <= position).map((c) => c.end));
  return Math.max(0, floor, position - seconds);
}
