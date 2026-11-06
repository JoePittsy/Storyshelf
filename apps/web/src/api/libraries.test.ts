import { describe, expect, it } from 'vitest';
import { bookLibraries, coverUrl, itemsUrl, mergeProgress, parseSort, pickLibrary, progressByItem } from './libraries';
import type { LibraryItem } from './libraries';

const item = (id: string): LibraryItem => ({ id, updatedAt: 7, media: { metadata: { title: id, authorName: null } } });

describe('sort mapping (REQ-12)', () => {
  it.each([
    ['addedAt', 'sort=addedAt&desc=1'],
    ['media.metadata.title', 'sort=media.metadata.title&desc=0'],
    ['media.metadata.authorNameLF', 'sort=media.metadata.authorNameLF&desc=0'],
    ['progress', 'sort=progress&desc=1'],
  ] as const)('%s', (key, expected) => {
    expect(decodeURIComponent(itemsUrl('lib', key, 0))).toContain(expected);
  });
  it('falls back to recently added for unknown keys', () => {
    expect(parseSort('nonsense')).toBe('addedAt');
    expect(parseSort(null)).toBe('addedAt');
  });
});

describe('itemsUrl', () => {
  it('pages 48 at a time and asks for the minified shape', () => {
    const url = itemsUrl('abc', 'addedAt', 2);
    expect(url).toMatch(/^\/api\/libraries\/abc\/items\?/);
    expect(url).toContain('limit=48');
    expect(url).toContain('page=2');
    expect(url).toContain('minified=1');
  });
});

describe('coverUrl', () => {
  it('uses a real width and busts the cache with updatedAt', () => {
    expect(coverUrl(item('x'))).toBe('/api/items/x/cover?width=400&format=webp&ts=7');
  });
});

describe('library choice (REQ-9)', () => {
  const libs = bookLibraries([
    { id: 'p', name: 'Pods', mediaType: 'podcast' },
    { id: 'a', name: 'Fiction', mediaType: 'book' },
    { id: 'b', name: 'Non-fiction', mediaType: 'book' },
  ]);
  it('drops non-book libraries', () => expect(libs.map((l) => l.id)).toEqual(['a', 'b']));
  it('prefers the URL, then the stored choice, then the first', () => {
    expect(pickLibrary(libs, 'b', 'a')).toBe('b');
    expect(pickLibrary(libs, null, 'b')).toBe('b');
    expect(pickLibrary(libs, 'p', 'gone')).toBe('a');
  });
});

describe('mergeProgress (REQ-10)', () => {
  const base = { duration: 1, currentTime: 0, lastUpdate: 0 };
  const map = progressByItem([
    { ...base, id: '1', libraryItemId: 'a', progress: 0.4, isFinished: false },
    { ...base, id: '2', libraryItemId: 'b', progress: 0.97, isFinished: true },
    { ...base, id: '3', libraryItemId: 'c', episodeId: 'e', progress: 0.5, isFinished: false },
  ]);
  it('attaches progress, finished books read as complete, others as zero', () => {
    const tiles = mergeProgress([item('a'), item('b'), item('c'), item('d')], map);
    expect(tiles.map((t) => [t.progress, t.isFinished])).toEqual([
      [0.4, false],
      [1, true],
      [0, false],
      [0, false],
    ]);
  });
});
