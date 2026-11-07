import { describe, expect, it } from 'vitest';
import type { LibraryItem, Progress } from '../api/libraries';
import type { AuthorSeries } from '../screens/seriesHelpers';
import { authorShelfBooks, MORE_BY_CAP, MORE_BY_THRESHOLD, moreBy, wantsMoreBy } from './moreBy';

const item = (id: string, authorName = 'Arthur Conan Doyle'): LibraryItem => ({
  id,
  updatedAt: 1,
  media: { metadata: { title: `Title ${id}`, authorName } },
});
const ids = (tiles: { item: { id: string } }[]) => tiles.map((t) => t.item.id);
const none = new Map<string, Progress>();
const finished = (...done: string[]) =>
  new Map<string, Progress>(done.map((id) => [id, { progress: 1, isFinished: true }]));
const own = (...list: string[]) => list.map((id) => ({ item: item(id), sub: null }));

describe('wantsMoreBy', () => {
  it(`shows for a finished book, or one at least ${MORE_BY_THRESHOLD * 100}% through`, () => {
    expect(wantsMoreBy({ progress: 0, isFinished: true })).toBe(true);
    expect(wantsMoreBy({ progress: MORE_BY_THRESHOLD, isFinished: false })).toBe(true);
    expect(wantsMoreBy({ progress: 0.9, isFinished: false })).toBe(true);
  });
  it('stays out of the way for a book not started or not far in', () => {
    expect(wantsMoreBy({ progress: 0, isFinished: false })).toBe(false);
    expect(wantsMoreBy({ progress: MORE_BY_THRESHOLD - 0.01, isFinished: false })).toBe(false);
  });
});

describe('authorShelfBooks', () => {
  const inSeries = (id: string, sequence: string | null) =>
    ({
      ...item(id),
      media: { metadata: { ...item(id).media.metadata, series: { sequence } } },
    }) as AuthorSeries['items'][number];
  const series: AuthorSeries[] = [
    { id: 'z', name: 'Zed tales', items: [inSeries('z2', '2'), inSeries('z1', '1')] },
    { id: 's', name: 'Sherlock Holmes', items: [inSeries('s1', '1'), inSeries('both', '2')] },
  ];
  const all = [item('s1'), item('z1'), item('z2'), item('loose'), item('both')];

  it("lists the author's books as their page does: series by name in reading order, then the rest", () => {
    expect(ids(authorShelfBooks(series, all))).toEqual(['s1', 'both', 'z1', 'z2', 'loose']);
  });

  it('says where a series book sits, and nothing for a book in no series', () => {
    expect(authorShelfBooks(series, all).map((b) => b.sub)).toEqual([
      'Book 1 of Sherlock Holmes',
      'Book 2 of Sherlock Holmes',
      'Book 1 of Zed tales',
      'Book 2 of Zed tales',
      null,
    ]);
  });

  it('lists a book in two series once, at its first place', () => {
    const two: AuthorSeries[] = [...series, { id: 'x', name: 'Another', items: [inSeries('both', '5')] }];
    const books = authorShelfBooks(two, all);
    expect(ids(books).filter((id) => id === 'both')).toHaveLength(1);
    expect(books.find((b) => b.item.id === 'both')?.sub).toBe('Book 5 of Another');
  });

  it('has nothing when the author has nothing', () => {
    expect(authorShelfBooks(undefined, undefined)).toEqual([]);
  });
});

describe('moreBy: the author row', () => {
  it('leaves out the book itself and any the listener has finished', () => {
    const { author } = moreBy({ bookId: 'a', author: own('a', 'b', 'c', 'd'), progress: finished('c') });
    expect(ids(author)).toEqual(['b', 'd']);
  });

  it('leaves out the series the Next in series card already offers', () => {
    const { author } = moreBy({ bookId: 'a', author: own('a', 'b', 'c', 'd'), progress: none, exclude: ['b', 'c'] });
    expect(ids(author)).toEqual(['d']);
  });

  it('keeps a book already begun, with its progress', () => {
    const progress = new Map<string, Progress>([['b', { progress: 0.4, isFinished: false }]]);
    const { author } = moreBy({ bookId: 'a', author: own('b', 'c'), progress });
    expect(author.map((t) => [t.item.id, t.progress])).toEqual([
      ['b', 0.4],
      ['c', 0],
    ]);
  });

  it(`stops at ${MORE_BY_CAP} books, and lists each once`, () => {
    const many = own(...Array.from({ length: 30 }, (_, i) => `x${i}`));
    expect(moreBy({ bookId: 'a', author: many, progress: none }).author).toHaveLength(MORE_BY_CAP);
    expect(ids(moreBy({ bookId: 'a', author: own('b', 'b', 'c'), progress: none }).author)).toEqual(['b', 'c']);
  });

  it('is empty when every other book is finished or offered elsewhere', () => {
    expect(moreBy({ bookId: 'a', author: own('a', 'b'), progress: finished('b') }).author).toEqual([]);
    expect(moreBy({ bookId: 'a', author: own('a'), progress: none }).author).toEqual([]);
    expect(moreBy({ bookId: 'a', progress: none }).author).toEqual([]);
  });
});

describe('moreBy: the narrator row', () => {
  const narrated = [item('a'), item('b'), item('n1', 'Jane Austen'), item('n2', 'Mary Shelley')];

  it("adds the narrator's books by other people, each with its author", () => {
    const { narrator } = moreBy({ bookId: 'a', author: own('a', 'b'), narrator: narrated, progress: none });
    expect(ids(narrator)).toEqual(['n1', 'n2']);
    expect(narrator.map((t) => t.sub)).toEqual(['Jane Austen', 'Mary Shelley']);
  });

  it('is empty when it would only repeat the author row (the same author and narrator)', () => {
    const { author, narrator } = moreBy({
      bookId: 'a',
      author: own('a', 'b'),
      narrator: [item('a'), item('b')],
      progress: none,
    });
    expect(ids(author)).toEqual(['b']);
    expect(narrator).toEqual([]);
  });

  it("never repeats one of the author's books, even one the author row had no room for", () => {
    const many = own(...Array.from({ length: 15 }, (_, i) => `x${i}`));
    const { narrator } = moreBy({ bookId: 'a', author: many, narrator: [item('x14'), item('n1')], progress: none });
    expect(ids(narrator)).toEqual(['n1']);
  });

  it('applies the same exclusions: the book itself, finished books and the Next in series offer', () => {
    const { narrator } = moreBy({
      bookId: 'a',
      narrator: [...narrated, item('n3', 'Someone')],
      progress: finished('n1'),
      exclude: ['n2'],
    });
    expect(ids(narrator)).toEqual(['b', 'n3']);
  });

  it(`stops at ${MORE_BY_CAP} books`, () => {
    const many = Array.from({ length: 30 }, (_, i) => item(`n${i}`, 'Someone'));
    expect(moreBy({ bookId: 'a', narrator: many, progress: none }).narrator).toHaveLength(MORE_BY_CAP);
  });
});
