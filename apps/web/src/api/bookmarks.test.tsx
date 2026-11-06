// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('./auth', async (orig) => ({ ...(await orig<typeof import('./auth')>()), absFetch: vi.fn() }));

import * as auth from './auth';
import {
  BOOKMARKS_KEY,
  bookmarkUrl,
  findBookmark,
  itemBookmarks,
  renameIn,
  upsertBookmark,
  useAddBookmark,
  useBookmarks,
  useDeleteBookmark,
  useRenameBookmark,
  withoutBookmark,
} from './bookmarks';
import type { Bookmark } from './bookmarks';

const absFetch = vi.mocked(auth.absFetch);
const bm = (time: number, title = `At ${time}`, libraryItemId = 'li_1', createdAt = 1): Bookmark => ({
  libraryItemId,
  time,
  title,
  createdAt,
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('list helpers', () => {
  const list = [bm(300), bm(20, 'b', 'li_2'), bm(100), bm(5)];

  it("itemBookmarks: one book's bookmarks, sorted by time", () => {
    expect(itemBookmarks(list, 'li_1').map((b) => b.time)).toEqual([5, 100, 300]);
    expect(itemBookmarks(list, 'li_2').map((b) => b.time)).toEqual([20]);
    expect(itemBookmarks(undefined, 'li_1')).toEqual([]);
  });

  it('findBookmark matches book and time', () => {
    expect(findBookmark(list, 'li_1', 100)).toBe(list[2]);
    expect(findBookmark(list, 'li_2', 100)).toBeUndefined();
  });

  it('upsertBookmark adds, or replaces the one at the same time (as ABS does), never duplicating', () => {
    const added = upsertBookmark(list, bm(50));
    expect(added).toHaveLength(5);
    const replaced = upsertBookmark(list, bm(100, 'New name'));
    expect(replaced).toHaveLength(4);
    expect(findBookmark(replaced, 'li_1', 100)?.title).toBe('New name');
  });

  it('withoutBookmark and renameIn touch only that book and time', () => {
    expect(withoutBookmark(list, 'li_1', 100).map((b) => b.time)).toEqual([300, 20, 5]);
    expect(withoutBookmark(list, 'li_2', 100)).toHaveLength(4);
    expect(findBookmark(renameIn(list, 'li_1', 5, 'Five'), 'li_1', 5)?.title).toBe('Five');
  });

  it('bookmarkUrl encodes the id and keeps a fractional time as ABS stores it', () => {
    expect(bookmarkUrl('a/b')).toBe('/api/me/item/a%2Fb/bookmark');
    expect(bookmarkUrl('li_1', 123.7)).toBe('/api/me/item/li_1/bookmark/123.7');
  });
});

function setup(initial: Bookmark[] | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  if (initial) qc.setQueryData(BOOKMARKS_KEY, initial);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

/** A promise the test settles, so the optimistic state can be seen before the server answers. */
function pending<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const cached = (qc: QueryClient) => qc.getQueryData<Bookmark[]>(BOOKMARKS_KEY);

describe('useBookmarks', () => {
  it("reads the user's bookmarks from /api/me, for one book and in time order", async () => {
    absFetch.mockResolvedValue({ id: 'u', bookmarks: [bm(90), bm(10, 'x', 'li_2'), bm(30)] });
    const { wrapper } = setup(undefined);
    const { result } = renderHook(() => useBookmarks('li_1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(absFetch).toHaveBeenCalledWith('/api/me');
    expect(result.current.data?.map((b) => b.time)).toEqual([30, 90]);
  });

  it('copes with a user without the field', async () => {
    absFetch.mockResolvedValue({ id: 'u' });
    const { wrapper } = setup(undefined);
    const { result } = renderHook(() => useBookmarks('li_1'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});

describe('useAddBookmark', () => {
  it('shows the bookmark at once, POSTs time and title, then marks the list for a refetch', async () => {
    const server = pending<Bookmark>();
    absFetch.mockImplementation((path, init) => (init?.method === 'POST' ? server.promise : Promise.resolve({ bookmarks: [bm(40, 'Here')] })));
    const { qc, wrapper } = setup([]);
    const { result } = renderHook(() => useAddBookmark(), { wrapper });
    act(() => result.current.mutate({ libraryItemId: 'li_1', time: 40, title: 'Here' }));
    await waitFor(() => expect(cached(qc)?.map((b) => b.title)).toEqual(['Here']));
    expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ time: 40, title: 'Here' }),
    });
    server.resolve(bm(40, 'Here'));
    await waitFor(() => expect(qc.getQueryState(BOOKMARKS_KEY)?.isInvalidated).toBe(true));
  });

  it('rolls back when the server refuses', async () => {
    absFetch.mockImplementation((_path, init) => (init?.method === 'POST' ? Promise.reject(new Error('down')) : Promise.resolve({ bookmarks: [bm(5)] })));
    const { qc, wrapper } = setup([bm(5)]);
    const { result } = renderHook(() => useAddBookmark(), { wrapper });
    act(() => result.current.mutate({ libraryItemId: 'li_1', time: 40, title: 'Here' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached(qc)?.map((b) => b.time)).toEqual([5]);
  });

  it("rolling back one add keeps another that is still on its way", async () => {
    const first = pending<Bookmark>();
    const second = pending<Bookmark>();
    const posts = [first, second];
    absFetch.mockImplementation((_path, init) => (init?.method === 'POST' ? posts.shift()!.promise : new Promise(() => undefined)));
    const { qc, wrapper } = setup([]);
    const { result } = renderHook(() => ({ a: useAddBookmark(), b: useAddBookmark() }), { wrapper });
    act(() => result.current.a.mutate({ libraryItemId: 'li_1', time: 10, title: 'A' }));
    await waitFor(() => expect(cached(qc)).toHaveLength(1));
    act(() => result.current.b.mutate({ libraryItemId: 'li_1', time: 20, title: 'B' }));
    await waitFor(() => expect(cached(qc)).toHaveLength(2));
    first.reject(new Error('down'));
    await waitFor(() => expect(result.current.a.isError).toBe(true));
    expect(cached(qc)?.map((b) => b.title)).toEqual(['B']);
  });
});

describe('useRenameBookmark', () => {
  it('renames at once with a PATCH matched by time, and restores the old name on failure', async () => {
    const server = pending<Bookmark>();
    absFetch.mockImplementation((_path, init) => (init?.method === 'PATCH' ? server.promise : new Promise(() => undefined)));
    const { qc, wrapper } = setup([bm(100, 'Old')]);
    const { result } = renderHook(() => useRenameBookmark(), { wrapper });
    act(() => result.current.mutate({ libraryItemId: 'li_1', time: 100, title: 'New' }));
    await waitFor(() => expect(cached(qc)?.[0]?.title).toBe('New'));
    expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ time: 100, title: 'New' }),
    });
    server.reject(new Error('down'));
    await waitFor(() => expect(cached(qc)?.[0]?.title).toBe('Old'));
  });
});

describe('useDeleteBookmark', () => {
  it('removes at once with a DELETE by time, and puts it back on failure', async () => {
    const server = pending<undefined>();
    absFetch.mockImplementation((_path, init) => (init?.method === 'DELETE' ? server.promise : new Promise(() => undefined)));
    const original = bm(100.5, 'Keep me', 'li_1', 42);
    const { qc, wrapper } = setup([bm(5), original]);
    const { result } = renderHook(() => useDeleteBookmark(), { wrapper });
    act(() => result.current.mutate(original));
    await waitFor(() => expect(cached(qc)).toHaveLength(1));
    expect(absFetch).toHaveBeenCalledWith('/api/me/item/li_1/bookmark/100.5', { method: 'DELETE' });
    server.reject(new Error('down'));
    await waitFor(() => expect(cached(qc)).toHaveLength(2));
    expect(findBookmark(cached(qc), 'li_1', 100.5)).toEqual(original);
  });
});
