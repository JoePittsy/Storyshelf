import type { ProgressMode } from './progressWindow';

/**
 * The mode a tap on the progress bar moves to: Book, then Chapter, then Sleep (only while a sleep timer is set),
 * then Book. A book without chapters has no Chapter, and Sleep with no timer (it ended) is skipped or left for Book.
 */
export function nextMode(current: ProgressMode, o: { sleepActive: boolean; hasChapters: boolean }): ProgressMode {
  const order: ProgressMode[] = ['book'];
  if (o.hasChapters) order.push('chapter');
  if (o.sleepActive) order.push('sleep');
  const i = order.indexOf(current);
  // A mode that isn't on offer (Sleep after its timer ended, Chapter in a book with none) falls back to Book.
  return i < 0 ? 'book' : order[(i + 1) % order.length]!;
}

/** What the line above the bar says after a tap. `sleepLabel` is the Sleep window's "Stops in 12:30". */
export function modeFlash(mode: ProgressMode, sleepLabel?: string): string {
  if (mode === 'chapter') return 'This chapter';
  if (mode === 'sleep') return `Until sleep${sleepLabel ? ` · ${sleepLabel.replace(/^Stops in /, '')}` : ''}`;
  return 'Whole book';
}
