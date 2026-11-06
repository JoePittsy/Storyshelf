import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { absFetch } from './auth';
import type { LibraryItem } from './libraries';

// Only the ABS fields these screens use.
export interface AuthorRow {
  id: string;
  name: string;
  /** "Last, First", which ABS sorts by. */
  lastFirst?: string;
  numBooks: number;
  imagePath?: string | null;
  updatedAt?: number;
}
export interface NarratorRow {
  name: string;
  numBooks: number;
}
export interface SeriesRow {
  id: string;
  name: string;
  books: LibraryItem[];
}
interface SeriesPage {
  results: SeriesRow[];
  total: number;
  limit: number;
  page: number;
}

/** The library's tabs, each a route. */
export const LIBRARY_TABS = [
  { key: 'books', label: 'Books', path: '/' },
  { key: 'authors', label: 'Authors', path: '/authors' },
  { key: 'narrators', label: 'Narrators', path: '/narrators' },
  { key: 'series', label: 'Series', path: '/series' },
] as const;

/** The top-level destinations, as one row of real links: the library's tabs, then History. */
export const NAV_TABS = [...LIBRARY_TABS, { key: 'history', label: 'History', path: '/history' }] as const;

/** A path that keeps the selected library. */
export const withLibrary = (path: string, libraryId: string | undefined): string =>
  libraryId ? `${path}?library=${encodeURIComponent(libraryId)}` : path;

export const SERIES_PAGE_SIZE = 48;

export const authorsUrl = (libraryId: string): string => `/api/libraries/${libraryId}/authors?sort=lastFirst`;
export const narratorsUrl = (libraryId: string): string => `/api/libraries/${libraryId}/narrators`;
export const seriesUrl = (libraryId: string, page: number): string =>
  `/api/libraries/${libraryId}/series?${new URLSearchParams({
    limit: String(SERIES_PAGE_SIZE),
    page: String(page),
    sort: 'name',
    desc: '0',
    minified: '1',
  }).toString()}`;

/** The route param is already decoded by the router; a stray malformed escape is kept as typed. */
export function decodeName(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Case- and accent-insensitive "contains" filter; a blank query keeps everything. */
export function filterByName<T>(rows: T[], query: string, nameOf: (row: T) => string): T[] {
  const q = fold(query.trim());
  return q ? rows.filter((r) => fold(nameOf(r)).includes(q)) : rows;
}

export const bookCount = (n: number): string => `${n} ${n === 1 ? 'book' : 'books'}`;

/** Distinct author names across a series' books, in book order. */
export function seriesAuthors(books: LibraryItem[]): string {
  const names = books.flatMap((b) => (b.media.metadata.authorName ?? '').split(/,\s*/)).filter(Boolean);
  return [...new Set(names)].join(', ');
}

export const useAuthors = (libraryId: string | undefined) =>
  useQuery({
    queryKey: ['authors', libraryId],
    enabled: !!libraryId,
    queryFn: async () => (await absFetch<{ authors: AuthorRow[] }>(authorsUrl(libraryId ?? ''))).authors,
  });

export const useNarrators = (libraryId: string | undefined) =>
  useQuery({
    queryKey: ['narrators', libraryId],
    enabled: !!libraryId,
    queryFn: async () => (await absFetch<{ narrators: NarratorRow[] }>(narratorsUrl(libraryId ?? ''))).narrators,
  });

export const useSeriesList = (libraryId: string | undefined) =>
  useInfiniteQuery({
    queryKey: ['series', libraryId],
    enabled: !!libraryId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => absFetch<SeriesPage>(seriesUrl(libraryId ?? '', pageParam)),
    getNextPageParam: (last) => ((last.page + 1) * last.limit < last.total ? last.page + 1 : undefined),
  });
