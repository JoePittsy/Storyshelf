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
  { key: 'books', label: 'Library', path: '/' },
  { key: 'authors', label: 'Authors', path: '/authors' },
  { key: 'narrators', label: 'Narrators', path: '/narrators' },
  { key: 'series', label: 'Series', path: '/series' },
] as const;

export interface NavTab {
  key: string;
  label: string;
  path: string;
  /** A phone shows this gear instead of the word (the link keeps its name). */
  icon?: 'settings';
  /** Sits after a divider, apart from the library's own destinations. */
  separated?: boolean;
}

/** The top-level destinations, as one row of real links: the library's tabs, History, then Settings after a divider. */
export const NAV_TABS: readonly NavTab[] = [
  ...LIBRARY_TABS,
  { key: 'history', label: 'History', path: '/history' },
  { key: 'settings', label: 'Settings', path: '/settings', icon: 'settings', separated: true },
];

/** The library's own sections, shown inside the Library tab rather than as tabs of their own (the phone row is full). */
const LIBRARY_SECTION_PATHS = new Set(['/', '/collections', '/playlists']);

/** The top-level tab a route sits under: a list, or History and its sections. Detail pages (a book) have none. */
export function navTabFor(pathname: string): NavTab | undefined {
  if (LIBRARY_SECTION_PATHS.has(pathname)) return NAV_TABS[0];
  return NAV_TABS.find((t) => (t.key === 'history' ? pathname.startsWith('/history') : t.path === pathname));
}

/** Whether a route is one of the library's sections (Books, Collections, Playlists). */
export const isLibrarySection = (pathname: string): boolean => LIBRARY_SECTION_PATHS.has(pathname);

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
