import { chapterIndexAt, nextChapterTarget, previousChapterTarget, type Chapter } from './chapters';

/** A jump shorter than this loses no place worth a toast (restarting a chapter you just started, say). */
export const MIN_UNDO_DISTANCE = 2;

/** Where Undo returns to: the position before the jump, or null when there is nothing to lose (idle, or barely moved). */
export function undoPoint(status: string, position: number, target: number): number | null {
  if (status === 'idle') return null;
  return Math.abs(target - position) < MIN_UNDO_DISTANCE ? null : position;
}

/** "Chapter 3" for the chapter that starts at or contains `target`; "Chapter" never appears bare. */
export function jumpLabel(chapters: Chapter[], target: number): string {
  const i = chapterIndexAt(chapters, target);
  return i >= 0 ? `Chapter ${i + 1}` : 'that point';
}

/** The previous-chapter move as a jump, or null with no chapters. */
export function previousJump(chapters: Chapter[], position: number): { target: number; label: string } | null {
  if (chapters.length === 0) return null;
  const target = previousChapterTarget(chapters, position);
  return { target, label: jumpLabel(chapters, target) };
}

/** The next-chapter move as a jump, or null in the last chapter. */
export function nextJump(chapters: Chapter[], position: number): { target: number; label: string } | null {
  const target = nextChapterTarget(chapters, position);
  return target === null ? null : { target, label: jumpLabel(chapters, target) };
}
