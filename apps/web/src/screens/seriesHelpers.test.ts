import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../api/libraries';
import { compareBooks, groupAuthorBooks, nextBook, sortSeriesBooks } from './seriesHelpers';

const book = (id: string, title: string, publishedYear?: string): LibraryItem => ({
  id,
  updatedAt: 1,
  media: { metadata: { title, authorName: null, publishedYear } },
});
const sb = (id: string, sequence: string | null, title = id, year?: string) => ({
  item: book(id, title, year),
  sequence,
});
const order = (bs: ReturnType<typeof sb>[]) => sortSeriesBooks(bs).map((b) => b.item.id);

describe('series ordering (REQ-27, REQ-30)', () => {
  it('sorts numerically, not as text, with decimals and ranges', () => {
    expect(order([sb('10', '10'), sb('2-3', '2-3'), sb('2', '2'), sb('1.5', '1.5'), sb('1', '1')])).toEqual([
      '1',
      '1.5',
      '2',
      '2-3',
      '10',
    ]);
  });
  it('puts books with no sequence last, by year then title', () => {
    expect(
      order([
        sb('z', null, 'Zed', '2001'),
        sb('a', null, 'Alpha', '2001'),
        sb('old', null, 'Old', '1990'),
        sb('none', null, 'No year'),
        sb('s1', '1'),
      ]),
    ).toEqual(['s1', 'old', 'a', 'z', 'none']);
  });
  it('breaks ties between equal sequences by year then title', () => {
    expect(order([sb('b', '1', 'B', '2000'), sb('a', '1', 'A', '2000'), sb('c', '1', 'C', '1999')])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
  it('treats text with no leading number as no sequence', () => {
    expect(compareBooks({ sequence: 'Book one', title: 'a' }, { sequence: '3', title: 'b' })).toBeGreaterThan(0);
  });
});

describe('groupAuthorBooks (REQ-27)', () => {
  const inSeries = (id: string, seq: string) => ({
    ...book(id, id),
    media: { metadata: { title: id, authorName: null, series: { sequence: seq } } },
  });
  it('orders sections by name, books by sequence, and lists the rest as other, with a book in two series in both', () => {
    const { sections, other } = groupAuthorBooks(
      [
        { id: 's2', name: 'The Sandman', items: [inSeries('act2', '2'), inSeries('act1', '1')] },
        { id: 's1', name: 'Discworld', items: [inSeries('act1', '4')] },
      ],
      [book('act1', 'Act I'), book('act2', 'Act II'), book('solo2', 'Solo B', '2010'), book('solo1', 'Solo A', '2005')],
    );
    expect(sections.map((s) => s.name)).toEqual(['Discworld', 'The Sandman']);
    expect(sections[1]?.books.map((b) => [b.item.id, b.sequence])).toEqual([
      ['act1', '1'],
      ['act2', '2'],
    ]);
    expect(sections[0]?.books.map((b) => b.item.id)).toEqual(['act1']);
    expect(other.map((b) => b.item.id)).toEqual(['solo1', 'solo2']);
  });
});

describe('nextBook', () => {
  const books = [sb('a', '1'), sb('b', '2'), sb('c', '3')];
  const prog = (entries: [string, number, boolean][]) =>
    new Map(entries.map(([id, progress, isFinished]) => [id, { progress, isFinished }]));
  it('starts the first book when nothing is begun', () => {
    expect(nextBook(books, new Map())).toMatchObject({ label: 'Start', book: { item: { id: 'a' } } });
  });
  it('continues at the first unfinished book', () => {
    expect(nextBook(books, prog([['a', 1, true], ['b', 0.4, false]]))).toMatchObject({
      label: 'Continue',
      book: { item: { id: 'b' } },
    });
  });
  it('starts again from the top when all are finished', () => {
    expect(nextBook(books, prog([['a', 1, true], ['b', 1, true], ['c', 1, true]]))).toMatchObject({
      label: 'Start again',
      book: { item: { id: 'a' } },
    });
  });
  it('is undefined with no books', () => {
    expect(nextBook([], new Map())).toBeUndefined();
  });
});
