import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { absFetch } from './auth';
import type { MediaProgress } from './types';

// Only the ABS fields the library screen uses.
export interface Library {
  id: string;
  name: string;
  mediaType: string;
}

export interface LibraryItem {
  id: string;
  updatedAt: number;
  media: { metadata: { title: string; authorName: string | null } };
}

interface ItemsPage {
  results: LibraryItem[];
  total: number;
  limit: number;
  page: number;
}

export interface SearchResponse {
  book?: { libraryItem: LibraryItem }[];
  authors?: { id: string }[];
  narrators?: { name: string }[];
  series?: { series: { id: string } }[];
}

export interface Progress {
  progress: number;
  isFinished: boolean;
}

export const PAGE_SIZE = 48;

/** Sort options, keyed by ABS's own sort key. */
export const SORTS = [
  { key: 'addedAt', label: 'Recently added', desc: true },
  { key: 'media.metadata.title', label: 'Title', desc: false },
  { key: 'media.metadata.authorNameLF', label: 'Author', desc: false },
  { key: 'progress', label: 'Recently listened', desc: true },
] as const;

export type SortKey = (typeof SORTS)[number]['key'];

export const DEFAULT_SORT: SortKey = SORTS[0].key;

export function parseSort(value: string | null): SortKey {
  return SORTS.find((s) => s.key === value)?.key ?? DEFAULT_SORT;
}

export function itemsUrl(libraryId: string, sort: SortKey, page: number): string {
  const desc = SORTS.find((s) => s.key === sort)?.desc ? 1 : 0;
  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(page),
    sort,
    desc: String(desc),
    minified: '1',
  });
  return `/api/libraries/${libraryId}/items?${qs.toString()}`;
}

export function searchUrl(libraryId: string, q: string): string {
  return `/api/libraries/${libraryId}/search?${new URLSearchParams({ q, limit: '40' }).toString()}`;
}

export function coverUrl(item: Pick<LibraryItem, 'id' | 'updatedAt'>): string {
  return `/api/items/${item.id}/cover?width=400&format=webp&ts=${item.updatedAt}`;
}

/** Books only; a podcast library has no place here. */
export const bookLibraries = (libs: Library[]): Library[] => libs.filter((l) => l.mediaType === 'book');

/** Progress by library item. Podcast episode progress is skipped. */
export function progressByItem(list: MediaProgress[] = []): Map<string, Progress> {
  const map = new Map<string, Progress>();
  for (const p of list) if (!p.episodeId) map.set(p.libraryItemId, { progress: p.progress, isFinished: p.isFinished });
  return map;
}

export interface Tile {
  item: LibraryItem;
  /** 0..1; a finished book is 1 whatever its stored fraction. */
  progress: number;
  isFinished: boolean;
}

export function mergeProgress(items: LibraryItem[], progress: Map<string, Progress>): Tile[] {
  return items.map((item) => {
    const p = progress.get(item.id);
    return { item, progress: p?.isFinished ? 1 : (p?.progress ?? 0), isFinished: p?.isFinished ?? false };
  });
}

const STORE_KEY = 'storyshelf.library';
export const storedLibrary = (): string | null => {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};
export const storeLibrary = (id: string): void => {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {
    // Private mode or storage blocked: the URL still carries the choice.
  }
};

/** The URL's library if it is a book library, else the stored one, else the first. */
export function pickLibrary(libs: Library[], fromUrl: string | null, stored: string | null): string | undefined {
  const ids = new Set(libs.map((l) => l.id));
  return [fromUrl, stored].find((id): id is string => !!id && ids.has(id)) ?? libs[0]?.id;
}

export const useLibraries = () =>
  useQuery({
    queryKey: ['libraries'],
    queryFn: async () => bookLibraries((await absFetch<{ libraries: Library[] }>('/api/libraries')).libraries),
  });

export const useProgress = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: async () => progressByItem((await absFetch<{ mediaProgress?: MediaProgress[] }>('/api/me')).mediaProgress),
  });

export const useLibraryItems = (libraryId: string | undefined, sort: SortKey) =>
  useInfiniteQuery({
    queryKey: ['items', libraryId, sort],
    enabled: !!libraryId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => absFetch<ItemsPage>(itemsUrl(libraryId ?? '', sort, pageParam)),
    getNextPageParam: (last) => ((last.page + 1) * last.limit < last.total ? last.page + 1 : undefined),
  });

/** Most extra book lists fetched per search, by kind. */
export const SEARCH_CAPS = { authors: 5, narrators: 3, series: 3 } as const;

const toBase64 = (text: string): string => {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
};

/**
 * An ABS items filter: `group.` plus the base64 of the value, URL-encoded (ABS runs decodeURIComponent
 * before it decodes the base64). Series and authors filter by id, narrators by name.
 */
export const absFilter = (group: 'authors' | 'narrators' | 'series', value: string): string =>
  `${group}.${encodeURIComponent(toBase64(value))}`;

/** The filters worth fetching for a search response: matched authors, narrators and series, capped. */
export function searchFilters(res: SearchResponse): string[] {
  return [
    ...(res.authors ?? []).slice(0, SEARCH_CAPS.authors).map((a) => absFilter('authors', a.id)),
    ...(res.narrators ?? []).slice(0, SEARCH_CAPS.narrators).map((n) => absFilter('narrators', n.name)),
    ...(res.series ?? []).slice(0, SEARCH_CAPS.series).map((s) => absFilter('series', s.series.id)),
  ];
}

export function filteredItemsUrl(libraryId: string, filter: string): string {
  const qs = new URLSearchParams({ filter, limit: '40', page: '0', sort: 'media.metadata.title', minified: '1' });
  return `/api/libraries/${libraryId}/items?${qs.toString()}`;
}

/** Direct title matches first, then each filtered list in order, each item once. */
export function mergeResults(direct: LibraryItem[], extra: LibraryItem[][]): LibraryItem[] {
  const seen = new Set<string>();
  return [direct, ...extra].flat().filter((i) => !seen.has(i.id) && !!seen.add(i.id));
}

/** Books whose title matches, plus every book by a matched author or narrator or in a matched series. */
export const useLibrarySearch = (libraryId: string | undefined, q: string) =>
  useQuery({
    queryKey: ['search', libraryId, q],
    enabled: !!libraryId && !!q,
    queryFn: async () => {
      const id = libraryId ?? '';
      const res = await absFetch<SearchResponse>(searchUrl(id, q));
      const extra = await Promise.all(
        searchFilters(res).map(async (f) => (await absFetch<ItemsPage>(filteredItemsUrl(id, f))).results)
      );
      return mergeResults(
        (res.book ?? []).map((b) => b.libraryItem),
        extra
      );
    },
  });
