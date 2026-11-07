import { queryOptions, useQuery } from '@tanstack/react-query';
import { AbsError, absFetch } from './auth';
import { absFilter } from './libraries';
import type { LibraryItem } from './libraries';
import type { AuthorSeries } from '../screens/seriesHelpers';

// Only the fields the author and series pages use, from ABS 2.37.

/** GET /api/authors/:id?include=items,series */
export interface AuthorResponse {
  id: string;
  name: string;
  description: string | null;
  imagePath: string | null;
  updatedAt: number;
  libraryId: string;
  libraryItems?: LibraryItem[];
  series?: AuthorSeries[];
}

/** GET /api/series/:id */
export interface SeriesResponse {
  id: string;
  name: string;
  description: string | null;
  libraryId: string;
}

/** A series' book, as the library's series filter returns it: `metadata.series` carries this book's place in it. */
export type SeriesItem = LibraryItem & { media: { metadata: { series?: { sequence: string | null } } } };

const retryUnlessMissing = (count: number, e: unknown) => !(e instanceof AbsError && e.status === 404) && count < 2;

/** An author with their books and series. Not under /api/libraries, so ABS's per-user response cache never holds it. */
export const authorQuery = (id: string) =>
  queryOptions({
    queryKey: ['author', id],
    enabled: !!id,
    queryFn: () => absFetch<AuthorResponse>(`/api/authors/${encodeURIComponent(id)}?include=items,series`),
    retry: retryUnlessMissing,
  });

export const useAuthor = (id: string) => useQuery(authorQuery(id));

export const useSeries = (id: string) =>
  useQuery({
    queryKey: ['series', id],
    queryFn: () => absFetch<SeriesResponse>(`/api/series/${encodeURIComponent(id)}`),
    retry: retryUnlessMissing,
  });

/** Every book in a series (limit 0 is "no limit" to ABS). ABS only filters by series within a library. */
export const seriesBooksQuery = (libraryId: string | undefined, seriesId: string) =>
  queryOptions({
    queryKey: ['series-books', libraryId, seriesId],
    enabled: !!libraryId,
    queryFn: async () => {
      const qs = new URLSearchParams({ filter: absFilter('series', seriesId), sort: 'sequence', limit: '0', minified: '1' });
      return (await absFetch<{ results: SeriesItem[] }>(`/api/libraries/${libraryId}/items?${qs.toString()}`)).results;
    },
  });

export const useSeriesBooks = (libraryId: string | undefined, seriesId: string) =>
  useQuery(seriesBooksQuery(libraryId, seriesId));

/** Author name to id for a library, so a credit line can link people we only know by name. */
export const useAuthorIds = (libraryId: string | undefined) =>
  useQuery({
    queryKey: ['author-ids', libraryId],
    enabled: !!libraryId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { authors } = await absFetch<{ authors: { id: string; name: string }[] }>(
        `/api/libraries/${libraryId}/authors`,
      );
      return new Map(authors.map((a) => [a.name, a.id]));
    },
  });
