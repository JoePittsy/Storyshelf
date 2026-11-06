import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';

/** Where a detail page's back link goes, named for the screen the listener came from. Unknown or none: "Library". */
export function backLabel(from: string | null | undefined): string {
  const path = (from ?? '').split(/[?#]/)[0] ?? '';
  if (path.startsWith('/history')) return 'History';
  if (path === '/authors') return 'Authors';
  if (path.startsWith('/author/')) return 'Author';
  if (path === '/narrators') return 'Narrators';
  if (path.startsWith('/narrator/')) return 'Narrator';
  if (path === '/series') return 'Series';
  if (path.startsWith('/series/')) return 'Series';
  if (path.startsWith('/book/')) return 'Book';
  return 'Library';
}

// The route each history entry was reached from, by its location key. A back or forward step lands on a key that is
// already known, so it keeps the "from" it was first reached with.
const fromByKey = new Map<string, string>();
let lastPath: string | null = null;
let current: string | null = null;
const listeners = new Set<() => void>();

/** Records the route the app is on; call it once, from the frame. */
export function useRouteTrail(): void {
  const { key, pathname, search } = useLocation();
  useEffect(() => {
    if (!fromByKey.has(key) && lastPath !== null) fromByKey.set(key, lastPath);
    lastPath = pathname + search;
    current = fromByKey.get(key) ?? null;
    listeners.forEach((l) => l());
  }, [key, pathname, search]);
}

/** The route the current page was reached from, or null on a first load. */
export function usePreviousRoute(): string | null {
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
  lastPath = null;
  current = null;
}
