import { useSyncExternalStore } from 'react';
import { addMark, type Mark } from './bookHistory';

// The places this visit has left behind (before a chapter jump, a big seek or an Undo), in memory only, per book.
let marks: { itemId: string; list: Mark[] } = { itemId: '', list: [] };
const listeners = new Set<() => void>();

/** A seek further than this is a jump worth coming back from; shorter ones are just listening. */
export const BIG_SEEK_SECONDS = 120;

/** Remember where the listener was before leaving it. Another book starts a fresh list. */
export function recordJump(itemId: string, position: number, at = Date.now()): void {
  const list = marks.itemId === itemId ? marks.list : [];
  const next = addMark(list, { position, at });
  if (next === marks.list && marks.itemId === itemId) return;
  marks = { itemId, list: next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const none: Mark[] = [];

/** The jump marks for a book, oldest first. */
export const useJumpMarks = (itemId: string): Mark[] =>
  useSyncExternalStore(subscribe, () => (marks.itemId === itemId ? marks.list : none));

/** For tests. */
export const resetJumpLog = (): void => {
  marks = { itemId: '', list: [] };
};
