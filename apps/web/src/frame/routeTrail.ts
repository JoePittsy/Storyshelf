import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';

/** A back link's name is cut to this many characters, so a long title doesn't wrap the page head. */
export const BACK_LABEL_MAX = 32;

/** Cuts a name to `max` characters with an ellipsis; one that fits is left as it is. */
export function truncateName(name: string, max = BACK_LABEL_MAX): string {
  const t = name.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Where a detail page's back link goes, named for the place the listener came from: a book, author or series by its
 * own name when it is known ("The Tale of Peter Rabbit"), else by kind. Unknown or none: "Library".
 */
export function backLabel(from: string | null | undefined, title?: string | null): string {
  const path = (from ?? '').split(/[?#]/)[0] ?? '';
  const named = (kind: string) => (title?.trim() ? truncateName(title) : kind);
  if (path.startsWith('/history')) return 'History';
  if (path === '/authors') return 'Authors';
  if (path.startsWith('/author/')) return named('Author');
  if (path === '/narrators') return 'Narrators';
  if (path.startsWith('/narrator/')) return 'Narrator';
  if (path === '/series') return 'Series';
  if (path.startsWith('/series/')) return named('Series');
  if (path.startsWith('/book/')) return named('Book');
  return 'Library';
}

// The route each history entry was reached from, by its location key. A back or forward step lands on a key that is
// already known, so it keeps the "from" it was first reached with.
const fromByKey = new Map<string, string>();
const fromKeyByKey = new Map<string, string>();
// The title each page last set, by location key: what a back link names it, as it was when the listener left.
const titleByKey = new Map<string, string>();
let lastPath: string | null = null;
let lastKey: string | null = null;
let current: Place | null = null;

/** Where the current page was reached from: its route, and its title when it set one. */
export interface Place {
  path: string;
  title: string | null;
}

/** A page records its own title under its location key. */
export function rememberTitle(key: string, title: string): void {
  titleByKey.set(key, title);
}
const listeners = new Set<() => void>();

/** Records the route the app is on; call it once, from the frame. */
export function useRouteTrail(): void {
  const { key, pathname, search } = useLocation();
  useEffect(() => {
    if (!fromByKey.has(key) && lastPath !== null && lastKey !== null) {
      fromByKey.set(key, lastPath);
      fromKeyByKey.set(key, lastKey);
    }
    lastPath = pathname + search;
    lastKey = key;
    const path = fromByKey.get(key);
    const fromKey = fromKeyByKey.get(key);
    const same = current && path === current.path && (fromKey ? titleByKey.get(fromKey) ?? null : null) === current.title;
    if (!same) current = path === undefined ? null : { path, title: (fromKey ? titleByKey.get(fromKey) : undefined) ?? null };
    listeners.forEach((l) => l());
  }, [key, pathname, search]);
}

/** The place the current page was reached from, or null on a first load. */
export function usePreviousPlace(): Place | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => current,
  );
}

/** Test seam. */
export function resetRouteTrail(): void {
  fromByKey.clear();
  fromKeyByKey.clear();
  titleByKey.clear();
  lastPath = null;
  lastKey = null;
  current = null;
}
