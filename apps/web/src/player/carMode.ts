import { chapterIndexAt, type Chapter } from './chapters';
import { progressWindow } from './progressWindow';

export interface CarInput {
  /** Book seconds. */
  position: number;
  duration: number;
  chapters: Chapter[];
  rate: number;
}

export interface CarView {
  /** The current chapter's name, or null with no chapters (or in a gap between two). */
  title: string | null;
  /** Real seconds until the chapter ends (the book, with no chapters), at the current speed. */
  secondsLeft: number;
  /** How far through the chapter (the book, with no chapters), 0 to 1. */
  progress: number;
  hasChapters: boolean;
  /** There is a chapter after this one to go to. */
  hasNext: boolean;
}

/**
 * What car mode shows: the chapter, the time it will really take to finish it, and how far through it you are. The
 * span is the progress bar's chapter window, so a gap between chapters counts down to the next one, as the bar does.
 */
export function carView({ position, duration, chapters, rate }: CarInput): CarView {
  const hasChapters = chapters.length > 0;
  const w = progressWindow(hasChapters ? 'chapter' : 'book', { position, duration, chapters, rate, sleep: null, sleepFrom: 0 });
  const span = Math.max(0, w.end - w.start);
  const speed = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const left = span > 0 ? Math.min(span, Math.max(0, w.end - position)) : 0;
  const index = chapterIndexAt(chapters, position);
  const chapter = chapters[index];
  const nextStart = chapters.find((c) => c.start > position)?.start;
  return {
    title: chapter ? chapter.title.trim() || `Chapter ${index + 1}` : null,
    secondsLeft: left / speed,
    progress: span > 0 ? Math.min(1, Math.max(0, (position - w.start) / span)) : 0,
    hasChapters,
    hasNext: hasChapters && nextStart !== undefined,
  };
}
