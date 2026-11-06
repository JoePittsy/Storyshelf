import type { InProgressItem } from '../api/history';
import type { Progress } from '../api/libraries';
import { continueBooks } from '../components/resume';
import { chapterIndexAt, type Chapter } from './chapters';
import { clampSeek } from './timeline';

/** The book to put back in the player on load. Everything here is known without opening a playback session. */
export interface Restorable {
  id: string;
  title: string;
  author: string;
  /** Seconds. */
  duration: number;
  /** Seconds into the book: where the listener left it. */
  position: number;
}

/**
 * The most recently played unfinished book of this library, as the Continue shelf chooses it (books only, this
 * library, not hidden), that was really begun. Undefined when there is none.
 */
export function pickRestorable(
  inProgress: InProgressItem[] | undefined,
  progress: Map<string, Progress>,
  libraryId: string,
): Restorable | undefined {
  const tile = continueBooks(inProgress, progress, libraryId).find((t) => !t.isFinished);
  if (!tile) return undefined;
  const { item } = tile;
  const duration = item.media.duration ?? 0;
  const p = progress.get(item.id);
  const position = p?.currentTime ?? tile.progress * duration;
  if (!(position > 0)) return undefined;
  return {
    id: item.id,
    title: item.media.metadata.title,
    author: item.media.metadata.authorName ?? '',
    duration,
    position: duration > 0 ? clampSeek(position, duration) : position,
  };
}

/** What the player shows for a restored book: paused where it was left, with no session behind it yet. */
export function restoredPatch(
  r: Restorable,
  coverUrl: string,
  chapters: Chapter[],
): {
  status: 'paused';
  item: { id: string; title: string; author: string; coverUrl: string };
  position: number;
  duration: number;
  chapters: Chapter[];
  chapterIndex: number;
  restored: true;
  error: null;
} {
  return {
    status: 'paused',
    item: { id: r.id, title: r.title, author: r.author, coverUrl },
    position: r.position,
    duration: r.duration,
    chapters,
    chapterIndex: chapterIndexAt(chapters, r.position),
    restored: true,
    error: null,
  };
}

/**
 * A seek on a restored book has no audio to move, so it moves the place Play will start from: the clamped target and
 * the chapter it falls in.
 */
export function restoredSeek(target: number, duration: number, chapters: Chapter[]): { position: number; chapterIndex: number } {
  const position = clampSeek(target, duration);
  return { position, chapterIndex: chapterIndexAt(chapters, position) };
}
