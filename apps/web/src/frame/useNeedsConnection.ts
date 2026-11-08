import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { useOffline } from '../api/connectivity';

/**
 * The queries a page is made of: with nothing kept for one of these, the page has nothing to show. Not the secondary
 * ones (Continue listening's progress, a book's "more by"), whose sections stay quiet on their own.
 */
const PAGE_QUERIES = new Set([
  'libraries',
  'items',
  'item',
  'author',
  'authors',
  'narrators',
  'series',
  'series-books',
  'book-lists',
  'book-list',
  'listening-sessions',
  'finished',
  'listening-stats',
  'year-sessions',
  'year-stats',
]);

/** A page query on screen with nothing kept, waiting for a connection (TanStack's paused fetch). */
export const isWaitingPageQuery = (q: Pick<Query, 'queryKey' | 'state' | 'getObserversCount'>): boolean =>
  PAGE_QUERIES.has(String(q.queryKey[0])) &&
  q.getObserversCount() > 0 &&
  q.state.status === 'pending' &&
  q.state.fetchStatus === 'paused';

/** True while offline and the page on screen has nothing kept to show. */
export function useNeedsConnection(): boolean {
  const offline = useOffline();
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((cb: () => void) => cache.subscribe(cb), [cache]);
  const waiting = useSyncExternalStore(subscribe, () => cache.getAll().some(isWaitingPageQuery));
  return offline && waiting;
}
