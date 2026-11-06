import { describe, expect, it } from 'vitest';
import {
  SEARCH_CAPS,
  absFilter,
  bookLibraries,
  coverUrl,
  filteredItemsUrl,
  itemsUrl,
  mergeProgress,
  mergeResults,
  parseSort,
  pickLibrary,
  progressByItem,
  searchFilters,
} from './libraries';
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

describe('REQ-11 search finds books by title or author', () => {
  it('builds ABS filters: base64 of the value, URL-encoded', () => {
    expect(absFilter('authors', 'abc')).toBe('authors.YWJj');
    // "??>" is "Pz8+" in base64: the + must be escaped
    expect(absFilter('narrators', '??>')).toBe('narrators.Pz8%2B');
    // non-ASCII goes through UTF-8
    expect(absFilter('narrators', 'Zoë')).toBe('narrators.Wm%2FDqw%3D%3D');
  });

  it('double-encodes in the request so ABS decodes it once per layer', () => {
    const url = filteredItemsUrl('lib', absFilter('narrators', '??>'));
    expect(url).toContain('filter=narrators.Pz8%252B');
    expect(new URL(url, 'http://x').searchParams.get('filter')).toBe('narrators.Pz8%2B');
  });

  it('filters matched authors by id, narrators by name and series by id, capped', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => i);
    const f = searchFilters({
      authors: many(9).map((i) => ({ id: `a${i}`, name: `A${i}` })),
      narrators: many(9).map((i) => ({ name: `n${i}` })),
      series: many(9).map((i) => ({ series: { id: `s${i}`, name: `S${i}` } })),
    });
    expect(f.filter((x) => x.startsWith('authors.'))).toHaveLength(SEARCH_CAPS.authors);
    expect(f.filter((x) => x.startsWith('narrators.'))).toHaveLength(SEARCH_CAPS.narrators);
    expect(f.filter((x) => x.startsWith('series.'))).toHaveLength(SEARCH_CAPS.series);
    expect(f[0]).toBe(absFilter('authors', 'a0'));
  });

  it('needs no extra fetches when only titles matched', () => {
    expect(searchFilters({ book: [] })).toEqual([]);
  });

  it('lists title matches first and each book once', () => {
    const merged = mergeResults(
      [item('t1'), item('both')],
      [
        [item('a1'), item('both')],
        [item('a1'), item('s1')],
      ]
    );
    expect(merged.map((i) => i.id)).toEqual(['t1', 'both', 'a1', 's1']);
  });
});
