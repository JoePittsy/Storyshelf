import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { absFetch } from './auth';

/**
 * A place in a book, kept on the ABS user (server v2.37.2, MeController). Checked against 2.37.2:
 * - `time` is seconds into the book and is stored as sent, fractions included; the routes match on it exactly.
 * - POST at a time that already has one does not add a second: it replaces that bookmark's title (keeping createdAt).
 * - PATCH (rename) and DELETE answer 404 when nothing is at that time; DELETE answers the text "OK".
 * - `/api/me` lists them in the order they were made, across every book.
 */
export interface Bookmark {
  libraryItemId: string;
  title: string;
  time: number;
  /** Epoch ms. */
  createdAt: number;
}

/** Under `['me']`, so whatever refreshes the user (a saved session) refreshes these too. */
export const BOOKMARKS_KEY = ['me', 'bookmarks'] as const;
const MUTATION_KEY = ['bookmarks'] as const;

export const bookmarkUrl = (libraryItemId: string, time?: number) =>
  `/api/me/item/${encodeURIComponent(libraryItemId)}/bookmark${time === undefined ? '' : `/${time}`}`;

export const bookmarksQuery = queryOptions({
  queryKey: BOOKMARKS_KEY,
  queryFn: async () => {
    const me = await absFetch<{ bookmarks?: unknown } | undefined>('/api/me');
    return Array.isArray(me?.bookmarks) ? (me.bookmarks as Bookmark[]) : [];
  },
});

const same = (b: Bookmark, libraryItemId: string, time: number) => b.libraryItemId === libraryItemId && b.time === time;

/** One book's bookmarks, earliest in the book first. */
export const itemBookmarks = (list: Bookmark[] | undefined, libraryItemId: string): Bookmark[] =>
  (list ?? [])
    .filter((b) => b.libraryItemId === libraryItemId)
    .sort((a, b) => a.time - b.time || a.createdAt - b.createdAt);

export const findBookmark = (list: Bookmark[] | undefined, libraryItemId: string, time: number) =>
  list?.find((b) => same(b, libraryItemId, time));

/** Adds a bookmark, or replaces the one at the same time, as ABS does: never two at one time. */
export const upsertBookmark = (list: Bookmark[], b: Bookmark): Bookmark[] =>
  findBookmark(list, b.libraryItemId, b.time)
    ? list.map((x) => (same(x, b.libraryItemId, b.time) ? b : x))
    : [...list, b];

export const withoutBookmark = (list: Bookmark[], libraryItemId: string, time: number): Bookmark[] =>
  list.filter((b) => !same(b, libraryItemId, time));

export const renameIn = (list: Bookmark[], libraryItemId: string, time: number, title: string): Bookmark[] =>
  list.map((b) => (same(b, libraryItemId, time) ? { ...b, title } : b));

/** The book's bookmarks in time order. */
export const useBookmarks = (libraryItemId: string) =>
  useQuery({
    ...bookmarksQuery,
    enabled: !!libraryItemId,
    select: (list: Bookmark[]) => itemBookmarks(list, libraryItemId),
  });

type Change = (list: Bookmark[]) => Bookmark[];

/**
 * A bookmark write that shows in the cache at once. On failure only this change is undone (not a snapshot of the whole
 * list), so another write still on its way survives; the list is refetched once the last write settles.
 */
function useBookmarkWrite<V>(
  send: (v: V) => Promise<unknown>,
  change: (v: V, list: Bookmark[]) => { apply: Change; revert: Change }
) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: send,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: BOOKMARKS_KEY });
      const c = change(v, qc.getQueryData<Bookmark[]>(BOOKMARKS_KEY) ?? []);
      qc.setQueryData<Bookmark[]>(BOOKMARKS_KEY, (l) => c.apply(l ?? []));
      return c;
    },
    onError: (_e, _v, c) => {
      if (c) qc.setQueryData<Bookmark[]>(BOOKMARKS_KEY, (l) => c.revert(l ?? []));
    },
    onSettled: async () => {
      if (qc.isMutating({ mutationKey: MUTATION_KEY }) <= 1) await qc.invalidateQueries({ queryKey: BOOKMARKS_KEY });
    },
  });
}

const json = { 'content-type': 'application/json' };
type Ref = Pick<Bookmark, 'libraryItemId' | 'time' | 'title'>;

/** Adds a bookmark. A time that already has one is replaced (renamed), so check `findBookmark` first. */
export const useAddBookmark = () =>
  useBookmarkWrite(
    ({ libraryItemId, time, title }: Ref) =>
      absFetch<Bookmark>(bookmarkUrl(libraryItemId), {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ time, title }),
      }),
    (v, list) => {
      const before = findBookmark(list, v.libraryItemId, v.time);
      return {
        apply: (l) => upsertBookmark(l, { ...v, createdAt: Date.now() }),
        revert: (l) => (before ? upsertBookmark(l, before) : withoutBookmark(l, v.libraryItemId, v.time)),
      };
    }
  );

export const useRenameBookmark = () =>
  useBookmarkWrite(
    ({ libraryItemId, time, title }: Ref) =>
      absFetch<Bookmark>(bookmarkUrl(libraryItemId), {
        method: 'PATCH',
        headers: json,
        body: JSON.stringify({ time, title }),
      }),
    (v, list) => {
      const old = findBookmark(list, v.libraryItemId, v.time)?.title;
      return {
        apply: (l) => renameIn(l, v.libraryItemId, v.time, v.title),
        revert: (l) => (old === undefined ? l : renameIn(l, v.libraryItemId, v.time, old)),
      };
    }
  );

export const useDeleteBookmark = () =>
  useBookmarkWrite(
    (b: Bookmark) => absFetch<void>(bookmarkUrl(b.libraryItemId, b.time), { method: 'DELETE' }),
    (b) => ({
      apply: (l) => withoutBookmark(l, b.libraryItemId, b.time),
      revert: (l) => upsertBookmark(l, b),
    })
  );
