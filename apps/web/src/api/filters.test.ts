// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NO_FILTERS,
  chipLabel,
  clientFilters,
  countActive,
  filtersStoreKey,
  matchesFilters,
  parseFilters,
  resolveFilters,
  serverFilterValue,
  serverKey,
  storeFilters,
  storedFilters,
  writeFilters,
} from './filters';
import type { Filters } from './filters';
import type { LibraryItem, Progress } from './libraries';
import { itemsUrl } from './libraries';

const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });
const decodeFilter = (v: string | undefined) => {
  const [group, enc] = (v ?? '').split(/\.(.*)/s);
  return [group, Buffer.from(decodeURIComponent(enc ?? ''), 'base64').toString('utf8')];
};

const book = (over: Partial<LibraryItem['media']['metadata']> = {}, media: Partial<LibraryItem['media']> = {}): LibraryItem => ({
  id: 'b1',
  updatedAt: 1,
  media: { metadata: { title: 'T', authorName: 'A', ...over }, ...media },
});
const none = new Map<string, Progress>();

describe('REQ-43 URL and filter state round trip', () => {
  it('writes and reads every filter', () => {
    const all = f({ genre: 'Sci-Fi & Fantasy', progress: 'in-progress', lang: 'English', tag: 'a/b #1', publisher: 'Zoë Press', decade: '1980', abridged: true, ebook: true });
    const params = writeFilters(new URLSearchParams('library=L1&sort=x'), all);
    expect(parseFilters(new URLSearchParams(params.toString()))).toEqual(all);
    expect(params.get('library')).toBe('L1');
    expect(params.get('abridged')).toBe('1');
  });
  it('removes cleared filters and keeps the other parameters', () => {
    const on = writeFilters(new URLSearchParams('library=L1&q=x'), f({ genre: 'Fantasy', ebook: true }));
    const off = writeFilters(on, f({ ebook: true }));
    expect(off.has('genre')).toBe(false);
    expect(off.get('q')).toBe('x');
    expect(off.get('ebook')).toBe('1');
  });
  it('ignores junk values', () => {
    expect(parseFilters(new URLSearchParams('progress=nope&decade=abc&abridged=yes'))).toEqual(NO_FILTERS);
  });
});

describe('REQ-43 per-library persistence', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it('stores under storyshelf.filters.<library> and restores', () => {
    storeFilters('L1', f({ genre: 'Fantasy' }));
    expect(localStorage.getItem(filtersStoreKey('L1'))).toBe('genre=Fantasy');
    expect(storedFilters('L1').genre).toBe('Fantasy');
    expect(storedFilters('L2')).toEqual(NO_FILTERS);
  });
  it('forgets when everything is cleared', () => {
    storeFilters('L1', f({ genre: 'Fantasy' }));
    storeFilters('L1', NO_FILTERS);
    expect(localStorage.getItem(filtersStoreKey('L1'))).toBeNull();
  });
  it('uses the stored set only when the URL has no filters', () => {
    storeFilters('L1', f({ genre: 'Fantasy' }));
    expect(resolveFilters(new URLSearchParams('library=L1'), 'L1').genre).toBe('Fantasy');
    expect(resolveFilters(new URLSearchParams('tag=x'), 'L1')).toEqual(f({ tag: 'x' }));
  });
  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(storedFilters('L1')).toEqual(NO_FILTERS);
    expect(() => storeFilters('L1', f({ genre: 'x' }))).not.toThrow();
  });
});

describe('REQ-41 choosing the server filter', () => {
  it('sends nothing when nothing is filtered', () => {
    expect(serverKey(NO_FILTERS)).toBeNull();
    expect(serverFilterValue(NO_FILTERS)).toBeUndefined();
  });
  it('prefers genre, tag, publisher, language, decade, then progress', () => {
    const order: [Partial<Filters>, string][] = [
      [{ genre: 'g', tag: 't', publisher: 'p', lang: 'l', decade: '1980', progress: 'finished' }, 'genre'],
      [{ tag: 't', publisher: 'p', lang: 'l', decade: '1980', progress: 'finished' }, 'tag'],
      [{ publisher: 'p', lang: 'l', decade: '1980', progress: 'finished' }, 'publisher'],
      [{ lang: 'l', decade: '1980', progress: 'finished' }, 'lang'],
      [{ decade: '1980', progress: 'finished' }, 'decade'],
      [{ progress: 'finished', abridged: true }, 'progress'],
    ];
    for (const [over, key] of order) expect(serverKey(f(over))).toBe(key);
  });
  it('encodes the ABS group and value', () => {
    expect(decodeFilter(serverFilterValue(f({ genre: 'Sci-Fi & Fantasy' })))).toEqual(['genres', 'Sci-Fi & Fantasy']);
    expect(decodeFilter(serverFilterValue(f({ lang: 'Zoë' })))).toEqual(['languages', 'Zoë']);
    expect(decodeFilter(serverFilterValue(f({ decade: '1980' })))).toEqual(['publishedDecades', '1980']);
    expect(decodeFilter(serverFilterValue(f({ progress: 'hide-finished' })))).toEqual(['progress', 'not-finished']);
    expect(decodeFilter(serverFilterValue(f({ ebook: true })))).toEqual(['ebooks', 'ebook']);
  });
  it('leaves the others for the client, and everything when ABS is not used', () => {
    const all = f({ genre: 'g', progress: 'finished' });
    expect(clientFilters(all, true)).toEqual(f({ progress: 'finished' }));
    expect(clientFilters(all, false)).toEqual(all);
  });
  it('puts the filter on the items URL alongside paging', () => {
    const u = new URL(itemsUrl('L1', 'addedAt', 3, serverFilterValue(f({ genre: 'Fantasy' }))), 'http://x');
    expect(u.searchParams.get('page')).toBe('3');
    expect(u.searchParams.get('filter')).toMatch(/^genres\./);
    expect(new URL(itemsUrl('L1', 'addedAt', 0), 'http://x').searchParams.has('filter')).toBe(false);
  });
});

describe('REQ-37 REQ-40 client predicates', () => {
  it('matches genre case-insensitively and rejects a book with no genres', () => {
    expect(matchesFilters(book({ genres: ['Fantasy'] }), f({ genre: 'fantasy' }), none)).toBe(true);
    expect(matchesFilters(book({ genres: ['Horror'] }), f({ genre: 'fantasy' }), none)).toBe(false);
    expect(matchesFilters(book({}), f({ genre: 'fantasy' }), none)).toBe(false);
  });
  it('matches tags from the media, publisher and language case-insensitively', () => {
    expect(matchesFilters(book({}, { tags: ['Favourite'] }), f({ tag: 'FAVOURITE' }), none)).toBe(true);
    expect(matchesFilters(book({}), f({ tag: 'x' }), none)).toBe(false);
    expect(matchesFilters(book({ publisher: ' Penguin ' }), f({ publisher: 'penguin' }), none)).toBe(true);
    expect(matchesFilters(book({ publisher: null }), f({ publisher: 'penguin' }), none)).toBe(false);
    expect(matchesFilters(book({ language: 'English' }), f({ lang: 'english' }), none)).toBe(true);
    expect(matchesFilters(book({}), f({ lang: 'english' }), none)).toBe(false);
  });
  it('puts years in their decade, with the boundaries', () => {
    const d = (year: string | null | undefined, decade: string) =>
      matchesFilters(book({ publishedYear: year }), f({ decade }), none);
    expect(d('1980', '1980')).toBe(true);
    expect(d('1989', '1980')).toBe(true);
    expect(d('1990', '1980')).toBe(false);
    expect(d('1979', '1980')).toBe(false);
    expect(d(null, '1980')).toBe(false);
    expect(d('unknown', '1980')).toBe(false);
  });
  it('abridged is true-only; ebook needs a format', () => {
    expect(matchesFilters(book({ abridged: true }), f({ abridged: true }), none)).toBe(true);
    expect(matchesFilters(book({ abridged: false }), f({ abridged: true }), none)).toBe(false);
    expect(matchesFilters(book({}), f({ abridged: true }), none)).toBe(false);
    expect(matchesFilters(book({}, { ebookFormat: 'epub' }), f({ ebook: true }), none)).toBe(true);
    expect(matchesFilters(book({}), f({ ebook: true }), none)).toBe(false);
  });
  it('knows the four progress states', () => {
    const at = (p?: Progress) => new Map(p ? [['b1', p]] : []);
    const states = {
      untouched: at(),
      zero: at({ progress: 0, isFinished: false }),
      partway: at({ progress: 0.4, isFinished: false }),
      done: at({ progress: 0.2, isFinished: true }),
    };
    const show = (progress: string) =>
      Object.entries(states)
        .filter(([, m]) => matchesFilters(book(), f({ progress }), m))
        .map(([k]) => k);
    expect(show('hide-finished')).toEqual(['untouched', 'zero', 'partway']);
    expect(show('in-progress')).toEqual(['partway']);
    expect(show('not-started')).toEqual(['untouched', 'zero']);
    expect(show('finished')).toEqual(['done']);
  });
  it('REQ-41 combines every filter', () => {
    const b = book({ genres: ['Fantasy'], language: 'English', publishedYear: '1985' }, { tags: ['x'] });
    expect(matchesFilters(b, f({ genre: 'Fantasy', lang: 'English', decade: '1980', tag: 'x' }), none)).toBe(true);
    expect(matchesFilters(b, f({ genre: 'Fantasy', lang: 'French', decade: '1980', tag: 'x' }), none)).toBe(false);
  });
});

describe('REQ-42 chips', () => {
  it('labels what is applied', () => {
    const all = f({ genre: 'Fantasy', progress: 'in-progress', decade: '1980', abridged: true });
    expect([chipLabel(all, 'genre'), chipLabel(all, 'progress'), chipLabel(all, 'decade'), chipLabel(all, 'abridged')]).toEqual([
      'Genre: Fantasy',
      'Progress: In progress',
      'Published: 1980s',
      'Abridged',
    ]);
    expect(countActive(all)).toBe(4);
  });
});
