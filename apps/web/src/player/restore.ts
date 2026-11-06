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
  /** When the server last heard of that place (ms since the epoch, ABS `lastUpdate`); 0 when unknown. */
  updatedAt: number;
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
    updatedAt: p?.lastUpdate ?? 0,
  };
}

/**
 * Where the first Play of a restored book starts. The server's place wins (the restored snapshot may be hours old and
 * another device may have moved on); the only thing that beats it is a deliberate move made here since the restore
 * (a seek, skip or chapter jump), or a start point the caller named outright.
 */
export function chooseStart(named: number | undefined, movedHere: number | null, serverTime: number): number {
  return named ?? movedHere ?? serverTime;
}

/** What the server now says about a book's place, as far as a snapshot refresh needs it. */
export interface ServerPlace {
  id: string;
  /** Seconds into the book. */
  position: number;
  /** ms since the epoch. */
  lastUpdate: number;
  isFinished?: boolean;
}

/**
 * The position a restored snapshot should move to, or null to leave it. It moves only when the server has heard of a
 * later place than the snapshot holds, for the same book, and the listener has not moved it here (their move wins and
 * is on its way to the server).
 */
export function refreshedPosition(
  snapshot: { id: string; updatedAt: number; movedHere: boolean },
  server: ServerPlace | undefined,
): number | null {
  if (!server || server.id !== snapshot.id || snapshot.movedHere || server.isFinished) return null;
  if (!(server.lastUpdate > snapshot.updatedAt) || !(server.position >= 0)) return null;
  return server.position;
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
