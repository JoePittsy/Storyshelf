import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../api/libraries';
import { compareBooks, groupAuthorBooks, nextBook, nextBookLabel, nextBookStart, sortSeriesBooks } from './seriesHelpers';

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
  it('prefers the book in progress over an earlier one that was never started', () => {
    expect(nextBook(books, prog([['a', 0, false], ['b', 0.4, false]]))).toMatchObject({
      label: 'Continue',
      book: { item: { id: 'b' } },
    });
  });
  it('continues the book in progress when earlier ones are finished', () => {
    expect(nextBook(books, prog([['a', 1, true], ['b', 0.4, false]]))).toMatchObject({
      label: 'Continue',
      book: { item: { id: 'b' } },
    });
  });
  it('starts the first unstarted book when the rest are finished', () => {
    expect(nextBook(books, prog([['a', 1, true], ['b', 1, true]]))).toMatchObject({
      label: 'Start',
      book: { item: { id: 'c' } },
    });
    // A finished book with progress left over is finished, not in progress.
    expect(nextBook(books, prog([['a', 0.99, true]]))).toMatchObject({ label: 'Start', book: { item: { id: 'b' } } });
  });
  it('listens again from the top when all are finished', () => {
    expect(nextBook(books, prog([['a', 1, true], ['b', 1, true], ['c', 1, true]]))).toMatchObject({
      label: 'Listen again',
      book: { item: { id: 'a' } },
    });
  });
  it('is undefined with no books', () => {
    expect(nextBook([], new Map())).toBeUndefined();
  });
});

describe('nextBookStart', () => {
  it('plays from the saved place when continuing, and from the top otherwise', () => {
    const progress = new Map([['b', { currentTime: 4100 }]]);
    expect(nextBookStart({ label: 'Continue' }, progress, 'b')).toBe(4100);
    expect(nextBookStart({ label: 'Start' }, progress, 'b')).toBe(0);
    expect(nextBookStart({ label: 'Listen again' }, progress, 'b')).toBe(0);
  });
});

describe('nextBookLabel', () => {
  const withDuration = (id: string, seq: string, duration?: number) => ({
    item: { id, updatedAt: 1, media: { metadata: { title: id, authorName: null }, duration } },
    sequence: seq,
  });
  it('says which book and how much is left', () => {
    const b = withDuration('b', '2', 7200);
    expect(nextBookLabel({ book: b, label: 'Continue' }, new Map([['b', { currentTime: 4100 }]]))).toBe(
      'Continue #2 \u00b7 51m left',
    );
  });
  it('leaves out what is not known', () => {
    const b = withDuration('b', '2');
    expect(nextBookLabel({ book: b, label: 'Continue' }, new Map())).toBe('Continue #2');
    expect(nextBookLabel({ book: { ...b, sequence: null }, label: 'Continue' }, new Map())).toBe('Continue');
  });
  it('says "under a minute" rather than 0m', () => {
    const b = withDuration('b', '1', 1000);
    expect(nextBookLabel({ book: b, label: 'Continue' }, new Map([['b', { currentTime: 980 }]]))).toBe(
      'Continue #1 \u00b7 under a minute left',
    );
  });
  it('numbers Start, and leaves Listen again as it is', () => {
    const b = withDuration('a', '1', 100);
    expect(nextBookLabel({ book: b, label: 'Start' }, new Map())).toBe('Start #1');
    expect(nextBookLabel({ book: { ...b, sequence: null }, label: 'Start' }, new Map())).toBe('Start');
    expect(nextBookLabel({ book: b, label: 'Listen again' }, new Map())).toBe('Listen again');
  });
});
