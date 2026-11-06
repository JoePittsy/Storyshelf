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

export interface HistoryRow extends Mark {
  /** Stable for a render list. */
  key: string;
  /** The row for the current position: not a place to go back to. */
  current: boolean;
}

/** A session's two places for one book: where it began and where it stopped. Nothing for a podcast, another book or a lost link. */
export function sessionMarks(sessions: ListeningSession[], itemId: string): Mark[] {
  const marks: Mark[] = [];
  for (const s of sessions) {
    if (s.mediaType === 'podcast' || !s.libraryItemId || s.libraryItemId !== itemId) continue;
    marks.push({ position: s.startTime, at: s.startedAt }, { position: s.currentTime, at: s.updatedAt });
  }
  return marks.filter((m) => Number.isFinite(m.position) && m.position >= 0 && Number.isFinite(m.at) && m.at > 0);
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
  now: number;
  /** Collapse points this close together (seconds). */
  window?: number;
}

/**
 * The places in a book to go back to, newest first, led by "now". Session starts and stops and this visit's jump marks
 * are merged; a point within the window of the current position, or of a newer point already kept, is dropped, so a
 * session that stopped where the book is now, or two marks a few seconds apart, show once.
 */
export function historyRows({ itemId, sessions, jumps, position, now, window = DEDUPE_SECONDS }: Input): HistoryRow[] {
  const candidates = [...sessionMarks(sessions, itemId), ...jumps].sort((a, b) => b.at - a.at);
  const rows: HistoryRow[] = [{ key: 'now', at: now, position, current: true }];
  for (const m of candidates) {
    if (rows.some((r) => Math.abs(r.position - m.position) <= window)) continue;
    rows.push({ key: `${m.at}-${Math.round(m.position)}`, ...m, current: false });
  }
  return rows;
}
