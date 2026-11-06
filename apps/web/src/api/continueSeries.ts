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

interface Shelf {
  id: string;
  entities?: unknown[];
}

/**
 * ABS's own "Continue series" shelf, from GET /api/libraries/:id/personalized: for each series with a finished book,
 * no book in progress and something left unfinished, the first unfinished book (most recently listened series first).
 * Series hidden from Continue listening in ABS are left out. Empty when there are none.
 */
export const useContinueSeries = (libraryId: string | undefined) =>
  useQuery({
    queryKey: ['personalized', libraryId],
    enabled: !!libraryId,
    queryFn: async () => {
      const shelves = await absFetch<Shelf[]>(`/api/libraries/${libraryId}/personalized?limit=20`);
      return (shelves.find((s) => s.id === 'continue-series')?.entities ?? []) as ContinueSeriesItem[];
    },
  });
