import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../api/libraries';
import {
  compareBooks,
  groupAuthorBooks,
  nextBook,
  nextBookLabel,
  nextBookStart,
  sortSeriesBooks,
} from './seriesHelpers';

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
      ])
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
      [book('act1', 'Act I'), book('act2', 'Act II'), book('solo2', 'Solo B', '2010'), book('solo1', 'Solo A', '2005')]
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
    expect(nextBook(books, new Map())).toMatchObject({ label: 'Play', book: { item: { id: 'a' } } });
  });
  it('prefers the book in progress over an earlier one that was never started', () => {
    expect(
      nextBook(
        books,
        prog([
          ['a', 0, false],
          ['b', 0.4, false],
        ])
      )
    ).toMatchObject({
      label: 'Resume',
      book: { item: { id: 'b' } },
    });
  });
  it('continues the book in progress when earlier ones are finished', () => {
    expect(
      nextBook(
        books,
        prog([
          ['a', 1, true],
          ['b', 0.4, false],
        ])
      )
    ).toMatchObject({
      label: 'Resume',
      book: { item: { id: 'b' } },
    });
  });
  it('starts the first unstarted book when the rest are finished', () => {
    expect(
      nextBook(
        books,
        prog([
          ['a', 1, true],
          ['b', 1, true],
        ])
      )
    ).toMatchObject({
      label: 'Play',
      book: { item: { id: 'c' } },
    });
    // A finished book with progress left over is finished, not in progress.
    expect(nextBook(books, prog([['a', 0.99, true]]))).toMatchObject({ label: 'Play', book: { item: { id: 'b' } } });
  });
  it('plays again from the top when all are finished', () => {
    expect(
      nextBook(
        books,
        prog([
          ['a', 1, true],
          ['b', 1, true],
          ['c', 1, true],
        ])
      )
    ).toMatchObject({
      label: 'Play again',
      book: { item: { id: 'a' } },
    });
  });
  it('is undefined with no books', () => {
    expect(nextBook([], new Map())).toBeUndefined();
  });
});

describe('nextBookStart', () => {
  it("carries on from the server's place when resuming (no start named), and from the top otherwise", () => {
    expect(nextBookStart({ label: 'Resume' })).toBeUndefined();
    expect(nextBookStart({ label: 'Play' })).toBe(0);
    expect(nextBookStart({ label: 'Play again' })).toBe(0);
  });
});

describe('nextBookLabel', () => {
  const withDuration = (id: string, seq: string, duration?: number) => ({
    item: { id, updatedAt: 1, media: { metadata: { title: id, authorName: null }, duration } },
    sequence: seq,
  });
  it('says which book and how much is left', () => {
    const b = withDuration('b', '2', 7200);
    expect(nextBookLabel({ book: b, label: 'Resume' }, new Map([['b', { currentTime: 4100 }]]))).toBe(
      'Resume book 2 \u00b7 51m left'
    );
  });
  it('leaves out what is not known', () => {
    const b = withDuration('b', '2');
    expect(nextBookLabel({ book: b, label: 'Resume' }, new Map())).toBe('Resume book 2');
    expect(nextBookLabel({ book: { ...b, sequence: null }, label: 'Resume' }, new Map())).toBe('Resume');
  });
  it('says "under a minute" rather than 0m', () => {
    const b = withDuration('b', '1', 1000);
    expect(nextBookLabel({ book: b, label: 'Resume' }, new Map([['b', { currentTime: 980 }]]))).toBe(
      'Resume book 1 \u00b7 under a minute left'
    );
  });
  it('numbers the book to play, and leaves Play again as it is', () => {
    const b = withDuration('a', '1', 100);
    expect(nextBookLabel({ book: b, label: 'Play' }, new Map())).toBe('Play book 1');
    expect(nextBookLabel({ book: { ...b, sequence: null }, label: 'Play' }, new Map())).toBe('Play');
    expect(nextBookLabel({ book: b, label: 'Play again' }, new Map())).toBe('Play again');
  });
});
