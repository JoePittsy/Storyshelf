import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fmtLeft } from '@joepittsy/ui';
import { AbsError, absFetch } from './auth';
import type { LibraryItem, Progress } from './libraries';

// Collections (library-wide, made by admins in ABS) and playlists (each listener's own). Storyshelf only reads them:
// ABS stays the place to make and change them. Shapes as ABS 2.37.2 returns them.

/** A fully expanded ABS library item, as collections and playlists carry them. Only the fields used here. */
interface ExpandedItem {
  id: string;
  mediaType?: string;
  updatedAt: number;
  media: {
    duration?: number;
    metadata: { title: string; authorName?: string | null };
  };
}

/** GET /api/collections/:id, and each of GET /api/libraries/:id/collections' results. */
export interface CollectionResponse {
  id: string;
  libraryId: string;
  name: string;
  description?: string | null;
  /** In the collection's own order. */
  books?: ExpandedItem[];
}

/** GET /api/playlists/:id, and each of GET /api/libraries/:id/playlists' results. */
export interface PlaylistResponse {
  id: string;
  libraryId: string;
  name: string;
  description?: string | null;
  /** In the playlist's order. A podcast episode has an `episodeId`; an item ABS no longer has comes without `libraryItem`. */
  items?: { libraryItemId: string; episodeId?: string | null; libraryItem?: ExpandedItem; episode?: unknown }[];
}

interface ListPage<T> {
  results: T[];
  total: number;
  limit: number;
  page: number;
}

/** A collection or playlist as the screens show it: its books, in its order. */
export interface BookList {
  id: string;
  libraryId: string;
  name: string;
  description: string | null;
  books: LibraryItem[];
  /** Podcast episodes left out of a playlist: Storyshelf is for books. */
  skipped: number;
}

export type ListKind = 'collection' | 'playlist';

/**
 * ABS has no paged query for these: it builds every one, each book fully expanded (audio files, chapters), then slices
 * the page. `minified` is accepted and ignored. Pages stay small to keep each response light.
 */
export const LIST_PAGE_SIZE = 24;

const page = (path: string, n: number, limit: number) =>
  `${path}?${new URLSearchParams({ limit: String(limit), page: String(n) }).toString()}`;

export const collectionsUrl = (libraryId: string, n: number, limit = LIST_PAGE_SIZE): string =>
  page(`/api/libraries/${encodeURIComponent(libraryId)}/collections`, n, limit);
/** The signed-in listener's playlists in the library. */
export const playlistsUrl = (libraryId: string, n: number, limit = LIST_PAGE_SIZE): string =>
  page(`/api/libraries/${encodeURIComponent(libraryId)}/playlists`, n, limit);
export const collectionUrl = (id: string): string => `/api/collections/${encodeURIComponent(id)}`;
export const playlistUrl = (id: string): string => `/api/playlists/${encodeURIComponent(id)}`;

/** Just what the book grid and the player need, so a big expanded item isn't held on to. */
const toItem = (i: ExpandedItem): LibraryItem => ({
  id: i.id,
  updatedAt: i.updatedAt,
  media: {
    duration: i.media.duration,
    metadata: { title: i.media.metadata.title, authorName: i.media.metadata.authorName ?? null },
  },
});

export function fromCollection(c: CollectionResponse): BookList {
  return {
    id: c.id,
    libraryId: c.libraryId,
    name: c.name,
    description: c.description ?? null,
    books: (c.books ?? []).map(toItem),
    skipped: 0,
  };
}

/** A playlist's books in its order; podcast episodes are counted and left out, and a book listed twice shows once. */
export function fromPlaylist(p: PlaylistResponse): BookList {
  const seen = new Set<string>();
  const books: LibraryItem[] = [];
  let skipped = 0;
  for (const entry of p.items ?? []) {
    const item = entry.libraryItem;
    if (!item) continue;
    if (entry.episodeId || (item.mediaType && item.mediaType !== 'book')) {
      skipped++;
      continue;
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    books.push(toItem(item));
  }
  return { id: p.id, libraryId: p.libraryId, name: p.name, description: p.description ?? null, books, skipped };
}

// --- The Library's sections ---------------------------------------------------------------------------------------

export type SectionKey = 'books' | 'collections' | 'playlists';

export interface Section {
  key: SectionKey;
  label: string;
  path: string;
}

export const LIBRARY_SECTIONS: readonly Section[] = [
  { key: 'books', label: 'Books', path: '/' },
  { key: 'collections', label: 'Collections', path: '/collections' },
  { key: 'playlists', label: 'Playlists', path: '/playlists' },
];

/**
 * The section tabs worth showing: Books, plus Collections and Playlists when the library has some. With neither there
 * is no row at all. The section on screen is always kept, so a link to an empty one still has its tab and a way back.
 */
export function visibleSections(current: SectionKey, counts: { collections?: number; playlists?: number }): Section[] {
  const shown = LIBRARY_SECTIONS.filter(
    (s) => s.key === 'books' || s.key === current || (counts[s.key as 'collections' | 'playlists'] ?? 0) > 0
  );
  return shown.length > 1 ? shown : [];
}

// --- Play -------------------------------------------------------------------------------------------------------

/** The app's one play vocabulary: resume a place, play from the top, or play again. */
export type PlayLabel = 'Play' | 'Resume' | 'Play again';

export interface PlayTarget {
  item: LibraryItem;
  label: PlayLabel;
  /** Seconds to start from; undefined carries on from the server's place. */
  from?: number;
}

/**
 * What the list's Play does: the first book not yet finished, in the list's order, carrying on if it has begun. With
 * every book finished it goes round again from the first. There is no queue: the next book doesn't follow on.
 */
export function playTarget(books: LibraryItem[], progress: Map<string, Progress>): PlayTarget | undefined {
  const first = books[0];
  if (!first) return undefined;
  const next = books.find((b) => !progress.get(b.id)?.isFinished);
  if (!next) return { item: first, label: 'Play again', from: 0 };
  const p = progress.get(next.id);
  return p && p.progress > 0 ? { item: next, label: 'Resume' } : { item: next, label: 'Play', from: 0 };
}

/** "Play", "Play again", or "Resume · 2h 14m left" when the time left is known. */
export function playLabel(t: PlayTarget, progress: Map<string, Pick<Progress, 'currentTime'>>): string {
  if (t.label !== 'Resume') return t.label;
  const duration = t.item.media.duration ?? 0;
  const at = progress.get(t.item.id)?.currentTime ?? 0;
  return duration > 0 && at > 0 ? `Resume · ${fmtLeft((duration - at) * 1000)}` : 'Resume';
}

// --- Queries -----------------------------------------------------------------------------------------------------

const retryUnlessMissing = (count: number, e: unknown) => !(e instanceof AbsError && e.status === 404) && count < 2;

/**
 * How many collections and playlists the library has, to decide whether to offer them. One of each is fetched; a
 * failure counts as none (the entry points just stay hidden), so it is not retried.
 */
export const useListCounts = (libraryId: string | undefined) => {
  const opts = { enabled: !!libraryId, retry: false, staleTime: 5 * 60_000 } as const;
  const collections = useQuery({
    ...opts,
    queryKey: ['collections-count', libraryId],
    queryFn: async () => (await absFetch<ListPage<unknown>>(collectionsUrl(libraryId ?? '', 0, 1))).total,
  });
  const playlists = useQuery({
    ...opts,
    queryKey: ['playlists-count', libraryId],
    queryFn: async () => (await absFetch<ListPage<unknown>>(playlistsUrl(libraryId ?? '', 0, 1))).total,
  });
  return {
    counts: { collections: collections.data, playlists: playlists.data },
    /** Both answered, or failed. */
    settled: !!libraryId && !collections.isPending && !playlists.isPending,
  };
};

/** A library's collections or the listener's playlists, a page at a time. */
export const useBookLists = (kind: ListKind, libraryId: string | undefined) =>
  useInfiniteQuery({
    queryKey: ['book-lists', kind, libraryId],
    enabled: !!libraryId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (kind === 'collection') {
        const res = await absFetch<ListPage<CollectionResponse>>(collectionsUrl(libraryId ?? '', pageParam));
        return { ...res, results: res.results.map(fromCollection) };
      }
      const res = await absFetch<ListPage<PlaylistResponse>>(playlistsUrl(libraryId ?? '', pageParam));
      return { ...res, results: res.results.map(fromPlaylist) };
    },
    getNextPageParam: (last) => (last.limit && (last.page + 1) * last.limit < last.total ? last.page + 1 : undefined),
  });

/** One collection or playlist. */
export const useBookList = (kind: ListKind, id: string) =>
  useQuery({
    queryKey: ['book-list', kind, id],
    retry: retryUnlessMissing,
    queryFn: async () =>
      kind === 'collection'
        ? fromCollection(await absFetch<CollectionResponse>(collectionUrl(id)))
        : fromPlaylist(await absFetch<PlaylistResponse>(playlistUrl(id))),
  });
