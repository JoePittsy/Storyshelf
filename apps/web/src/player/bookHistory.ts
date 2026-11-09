import type { ListeningSession } from '../api/history';

/** Points closer than this (in book seconds) are the same place as far as "go back to" is concerned. */
export const DEDUPE_SECONDS = 30;
/** Jump marks kept for the playing book. */
export const MAX_JUMP_MARKS = 20;

/** A place the listener was at: book seconds, and when (epoch ms). */
export interface Mark {
  position: number;
  at: number;
}

/** A session of this book: where it began and stopped in the book, and when. */
export interface SessionEntry {
  kind: 'session';
  key: string;
  /** Book seconds. */
  from: number;
  to: number;
  /** Epoch ms it began, and last saved (its end). */
  startedAt: number;
  at: number;
  /** Seconds heard. */
  listened: number;
  session: ListeningSession;
}

/** Where this visit jumped from (a chapter skip, a seek): one place. */
export interface JumpEntry extends Mark {
  kind: 'jump';
  key: string;
}

export type HistoryEntry = SessionEntry | JumpEntry;

/** A session of this book that moved: not a podcast, another book, a lost link, or one opened and left where it was. */
function bookSessions(sessions: ListeningSession[], itemId: string): ListeningSession[] {
  return sessions.filter(
    (s) =>
      s.mediaType !== 'podcast' &&
      !!s.libraryItemId &&
      s.libraryItemId === itemId &&
      [s.startTime, s.currentTime].every((t) => Number.isFinite(t) && t >= 0) &&
      Number.isFinite(s.updatedAt) &&
      s.updatedAt > 0 &&
      Math.abs(s.currentTime - s.startTime) >= 1
  );
}

/** Adds a jump mark, newest last, capped. A repeat of the last mark (the same place within a second) is not added. */
export function addMark(marks: Mark[], mark: Mark, cap = MAX_JUMP_MARKS): Mark[] {
  const last = marks[marks.length - 1];
  if (last && Math.abs(last.position - mark.position) < 1 && mark.at - last.at < 1000) return marks;
  return [...marks, mark].slice(-cap);
}

interface Input {
  itemId: string;
  sessions: ListeningSession[];
  jumps: Mark[];
  /** Where the book is now, in seconds. */
  position: number;
  /** A jump mark this close (seconds) to the current position or to a session's ends adds nothing. */
  window?: number;
}

/**
 * This book's listening, newest first: each session as a stretch from one place to another, and this visit's jump
 * marks between them. A jump mark within the window of where the book is now, of a session's start or end, or of a
 * newer jump mark is left out: it is a place already on the list.
 */
export function historyEntries({ itemId, sessions, jumps, position, window = DEDUPE_SECONDS }: Input): HistoryEntry[] {
  const own = bookSessions(sessions, itemId);
  const places = [position, ...own.flatMap((s) => [s.startTime, s.currentTime])];
  const entries: HistoryEntry[] = own.map((s) => ({
    kind: 'session',
    key: `s-${s.id}`,
    from: s.startTime,
    to: s.currentTime,
    startedAt: s.startedAt,
    at: Math.max(s.updatedAt, s.startedAt),
    listened: Number(s.timeListening) || 0,
    session: s,
  }));
  for (const m of [...jumps].sort((a, b) => b.at - a.at)) {
    if (!Number.isFinite(m.position) || m.position < 0) continue;
    if (places.some((p) => Math.abs(p - m.position) <= window)) continue;
    places.push(m.position);
    entries.push({ kind: 'jump', key: `j-${m.at}-${Math.round(m.position)}`, ...m });
  }
  return entries.sort((a, b) => b.at - a.at);
}
