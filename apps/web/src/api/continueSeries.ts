import { useQuery } from '@tanstack/react-query';
import { absFetch } from './auth';
import type { LibraryItem } from './libraries';

/**
 * A book on ABS's "Continue series" shelf. `metadata.series` is the one series it continues (ABS 2.37 sends a single
 * `{ id, name, sequence }` here, not the usual array).
 */
export type ContinueSeriesItem = LibraryItem & {
  media: { metadata: { series?: { id: string; name: string; sequence: string | null } } };
};

/** A book on ABS's "Recently added" shelf, newest first. ABS 2.37 sends the minified item, with `addedAt` in ms. */
export type RecentItem = LibraryItem & { addedAt?: number; isMissing?: boolean; isInvalid?: boolean };

interface Shelf {
  id: string;
  entities?: unknown[];
}

/**
 * One shelf of GET /api/libraries/:id/personalized, ABS's home shelves. The request is made once; each shelf is picked
 * out of the same cached response.
 */
const usePersonalizedShelf = <T>(libraryId: string | undefined, shelf: string) =>
  useQuery({
    queryKey: ['personalized', libraryId],
    enabled: !!libraryId,
    queryFn: () => absFetch<Shelf[]>(`/api/libraries/${libraryId}/personalized?limit=20`),
    select: (shelves) => (shelves.find((s) => s.id === shelf)?.entities ?? []) as T[],
  });

/**
 * ABS's own "Continue series" shelf: for each series with a finished book, no book in progress and something left
 * unfinished, the first unfinished book (most recently listened series first). Series hidden from Continue listening
 * in ABS are left out. Empty when there are none.
 */
export const useContinueSeries = (libraryId: string | undefined) =>
  usePersonalizedShelf<ContinueSeriesItem>(libraryId, 'continue-series');

/** ABS's "Recently added" shelf: the library's newest books (up to 20), whatever the listener's progress. */
export const useRecentlyAdded = (libraryId: string | undefined) =>
  usePersonalizedShelf<RecentItem>(libraryId, 'recently-added');
