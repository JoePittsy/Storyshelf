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
  media: {
    metadata: {
      title: string;
      authorName: string | null;
      // Present in ABS's minified item; filters read them.
      genres?: string[];
      publisher?: string | null;
      language?: string | null;
      publishedYear?: string | null;
      abridged?: boolean;
      /** Comma-joined (", "). */
      narratorName?: string | null;
    };
    tags?: string[];
    ebookFormat?: string;
    /** Seconds; ABS's minified item carries it, and the in-progress list reads it. */
    duration?: number;
  };
}

interface ItemsPage {
  results: LibraryItem[];
  total: number;
  limit: number;
  page: number;
}

export interface SearchResponse {
  book?: { libraryItem: LibraryItem }[];
  authors?: { id: string; name: string; numBooks?: number; imagePath?: string | null; updatedAt?: number }[];
  narrators?: { name: string; numBooks?: number }[];
  series?: { series: { id: string; name: string } }[];
}

export interface Progress {
  progress: number;
  /** Seconds into the book. */
  currentTime?: number;
  isFinished: boolean;
  startedAt?: number;
  finishedAt?: number | null;
  hidden?: boolean;
  /** ms since the epoch: when the server last heard of this place. */
  lastUpdate?: number;
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

export function itemsUrl(libraryId: string, sort: SortKey, page: number, filter?: string): string {
  const desc = SORTS.find((s) => s.key === sort)?.desc ? 1 : 0;
  const qs = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page: String(page),
    sort,
    desc: String(desc),
    minified: '1',
  });
  if (filter) qs.set('filter', filter);
  return `/api/libraries/${libraryId}/items?${qs.toString()}`;
}

/** An author's photo, or undefined when they have none (the avatar then shows initials). ABS serves it without auth. */
export function authorImageUrl(
  a: { id: string; imagePath?: string | null; updatedAt?: number },
  width = 200
): string | undefined {
  return a.imagePath ? `/api/authors/${a.id}/image?width=${width}&format=webp&ts=${a.updatedAt ?? 0}` : undefined;
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
  for (const p of list) {
    if (p.episodeId) continue;
    map.set(p.libraryItemId, {
      progress: p.progress,
      currentTime: p.currentTime,
      isFinished: p.isFinished,
      startedAt: p.startedAt,
      finishedAt: p.finishedAt,
      hidden: p.hideFromContinueListening,
      lastUpdate: p.lastUpdate,
    });
  }
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

export const useLibraryItems = (libraryId: string | undefined, sort: SortKey, filter?: string) =>
  useInfiniteQuery({
    queryKey: ['items', libraryId, sort, filter ?? ''],
    enabled: !!libraryId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => absFetch<ItemsPage>(itemsUrl(libraryId ?? '', sort, pageParam, filter)),
    getNextPageParam: (last) => ((last.page + 1) * last.limit < last.total ? last.page + 1 : undefined),
  });

/** Most extra book lists fetched per search, by kind. */
export const SEARCH_CAPS = { authors: 5, narrators: 3, series: 3 } as const;

/** The library filtered to a narrator. Narrators have no id or page in ABS, so the name is the filter. */
export const narratorPath = (name: string, libraryId?: string | null): string => {
  const p = new URLSearchParams();
  if (libraryId) p.set('library', libraryId);
  p.set('narrator', name);
  return `/?${p.toString()}`;
};

const toBase64 = (text: string): string => {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
};

/**
 * An ABS items filter: `group.` plus the base64 of the value, URL-encoded (ABS runs decodeURIComponent
 * before it decodes the base64). Series and authors filter by id, narrators by name.
 */
export const absFilter = (group: string, value: string): string => `${group}.${encodeURIComponent(toBase64(value))}`;

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

export interface SearchChip {
  key: string;
  kind: 'Author' | 'Narrator' | 'Series';
  label: string;
  href: string;
  /** Only authors and narrators have a face. */
  avatar?: { name: string; imageUrl?: string };
}

/** Matched authors, narrators and series as chips linking to their pages, in that order, capped like the book lists. */
export function searchChips(res: SearchResponse, libraryId: string): SearchChip[] {
  const lib = `?library=${encodeURIComponent(libraryId)}`;
  return [
    ...(res.authors ?? []).slice(0, SEARCH_CAPS.authors).map((a): SearchChip => ({
      key: `a-${a.id}`,
      kind: 'Author',
      label: a.name,
      href: `/author/${encodeURIComponent(a.id)}${lib}`,
      avatar: { name: a.name, imageUrl: authorImageUrl(a, 64) },
    })),
    ...(res.narrators ?? []).slice(0, SEARCH_CAPS.narrators).map((n): SearchChip => ({
      key: `n-${n.name}`,
      kind: 'Narrator',
      label: n.name,
      href: narratorPath(n.name, libraryId),
      avatar: { name: n.name },
    })),
    ...(res.series ?? []).slice(0, SEARCH_CAPS.series).map((s): SearchChip => ({
      key: `s-${s.series.id}`,
      kind: 'Series',
      label: s.series.name,
      href: `/series/${encodeURIComponent(s.series.id)}${lib}`,
    })),
  ];
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
      return {
        books: mergeResults(
          (res.book ?? []).map((b) => b.libraryItem),
          extra
        ),
        chips: searchChips(res, id),
      };
    },
  });
