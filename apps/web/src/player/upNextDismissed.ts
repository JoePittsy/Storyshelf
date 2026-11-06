import { useSyncExternalStore } from 'react';

// The books whose Up next card the listener has closed, most recent last. Per device, like the player settings.
const KEY = 'storyshelf.upNextDismissed';
export const MAX_DISMISSED = 100;

function load(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

let ids = load();
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** Close Up next for the book that ended, for good: it doesn't come back when that book ends again. */
export function dismissUpNext(bookId: string): void {
  ids = [...ids.filter((x) => x !== bookId), bookId].slice(-MAX_DISMISSED);
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Private mode or storage blocked: it stays closed for this visit.
  }
  listeners.forEach((cb) => cb());
}

/** True when Up next has been closed for this book. */
export function useUpNextDismissed(bookId: string | undefined): boolean {
  const list = useSyncExternalStore(subscribe, () => ids);
  return !!bookId && list.includes(bookId);
}
