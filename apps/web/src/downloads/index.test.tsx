// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { downloadOf, isDownloaded, setDownloadsForTests, useDownloads, type DownloadedBook } from '.';

const book = (itemId: string, status: DownloadedBook['status']): DownloadedBook => ({
  itemId,
  libraryId: 'lib',
  title: itemId,
  author: '',
  coverUrl: null,
  duration: 1,
  bytes: 0,
  totalBytes: 1,
  status,
  addedAt: 1,
});

afterEach(() => setDownloadsForTests([]));

describe('downloads store', () => {
  it('tells its readers about every change, and answers lookups', () => {
    const { result } = renderHook(() => useDownloads());
    expect(result.current).toEqual([]);
    const next = [book('a', 'downloading'), book('b', 'complete')];
    act(() => setDownloadsForTests(next));
    expect(result.current).toBe(next);
    expect(downloadOf('a')?.status).toBe('downloading');
    expect(isDownloaded('a')).toBe(false);
    expect(isDownloaded('b')).toBe(true);
    expect(downloadOf('c')).toBeUndefined();
  });
});
