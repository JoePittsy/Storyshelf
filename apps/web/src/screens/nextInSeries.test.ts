import { describe, expect, it } from 'vitest';
import type { LibraryItem, Progress } from '../api/libraries';
import { bookInSeries, nextInSeries, seriesSpan } from './nextInSeries';
import type { SeriesBook } from './seriesHelpers';

const item = (id: string, title = id): LibraryItem => ({
  id,
  updatedAt: 1,
  media: { metadata: { title, authorName: null } },
});
const sb = (id: string, sequence: string | null, title = id): SeriesBook => ({ item: item(id, title), sequence });
const series = (id: string, ...books: SeriesBook[]) => [id, books] as const;

type P = Map<string, Progress>;
const progress = (entries: Record<string, 'finished' | 'begun'>): P =>
  new Map(
    Object.entries(entries).map(([id, s]) => [
      id,
      s === 'finished' ? { progress: 1, isFinished: true } : { progress: 0.3, currentTime: 100, isFinished: false },
    ])
  );

/** The book being finished, in one series called "S" at `sequence`. */
const current = (id: string, sequence: string | null, seriesId = 'S', name = 'The series') => ({
  id,
  series: [{ id: seriesId, name, sequence }],
});
const next = (cur: ReturnType<typeof current>, books: SeriesBook[], p: P = new Map()) =>
  nextInSeries(cur, new Map([series('S', ...books)]), p);

describe('seriesSpan', () => {
  it('reads whole, decimal and range sequences', () => {
    expect(seriesSpan('3')).toEqual({ start: 3, end: 3 });
    expect(seriesSpan('1.5')).toEqual({ start: 1.5, end: 1.5 });
    expect(seriesSpan('2-3')).toEqual({ start: 2, end: 3 });
    expect(seriesSpan('4 – 6')).toEqual({ start: 4, end: 6 });
    expect(seriesSpan('0')).toEqual({ start: 0, end: 0 });
  });
  it('has no place for a missing or non-numeric sequence', () => {
    expect(seriesSpan(null)).toBeUndefined();
    expect(seriesSpan('')).toBeUndefined();
    expect(seriesSpan('Book one')).toBeUndefined();
    expect(seriesSpan('Prequel')).toBeUndefined();
  });
});

describe('nextInSeries: one series', () => {
  it('offers the book after this one, to start', () => {
    const books = [sb('b1', '1'), sb('b2', '2'), sb('b3', '3')];
    expect(next(current('b1', '1'), books)).toMatchObject({
      series: { id: 'S', name: 'The series' },
      book: { item: { id: 'b2' }, sequence: '2' },
      label: 'Play',
    });
  });

  it('sorts numerically, whatever order the server sent', () => {
    const books = [sb('b10', '10'), sb('b2', '2'), sb('b9', '9')];
    expect(next(current('b2', '2'), books)?.book.item.id).toBe('b9');
  });

  it('offers a decimal book (a novella between two) in its place', () => {
    const books = [sb('b1', '1'), sb('b2', '2'), sb('b15', '1.5')];
    expect(next(current('b1', '1'), books)?.book.item.id).toBe('b15');
    expect(next(current('b15', '1.5'), books)?.book.item.id).toBe('b2');
  });

  it('skips books already finished', () => {
    const books = [sb('b1', '1'), sb('b2', '2'), sb('b3', '3'), sb('b4', '4')];
    expect(next(current('b1', '1'), books, progress({ b2: 'finished', b3: 'finished' }))?.book.item.id).toBe('b4');
  });

  it('offers a book already begun as Continue', () => {
    const books = [sb('b1', '1'), sb('b2', '2')];
    expect(next(current('b1', '1'), books, progress({ b2: 'begun' }))).toMatchObject({
      book: { item: { id: 'b2' } },
      label: 'Resume',
    });
  });

  it('has nothing to offer after the last book', () => {
    const books = [sb('b1', '1'), sb('b2', '2')];
    expect(next(current('b2', '2'), books)).toBeUndefined();
  });

  it('has nothing to offer when everything after this one is finished', () => {
    const books = [sb('b1', '1'), sb('b2', '2'), sb('b3', '3')];
    expect(next(current('b1', '1'), books, progress({ b2: 'finished', b3: 'finished' }))).toBeUndefined();
  });

  it('never offers an earlier book, even an unfinished one', () => {
    const books = [sb('b1', '1'), sb('b2', '2'), sb('b3', '3')];
    expect(next(current('b3', '3'), books)).toBeUndefined();
  });

  it('has nothing to offer when this book has no place in the series', () => {
    const books = [sb('b1', '1'), sb('x', null), sb('b2', '2')];
    expect(next(current('x', null), books)).toBeUndefined();
    expect(next(current('x', 'Prequel'), books)).toBeUndefined();
  });

  it('never offers a book with no place in the series', () => {
    const books = [sb('b1', '1'), sb('guide', null), sb('extra', 'Companion')];
    expect(next(current('b1', '1'), books)).toBeUndefined();
  });

  it('skips another book at the same place (a second edition, or a duplicate)', () => {
    const books = [sb('b1', '1'), sb('b1-again', '1'), sb('b2', '2')];
    expect(next(current('b1', '1'), books)?.book.item.id).toBe('b2');
  });

  it('among duplicates at the next place, prefers the one begun, then the first in reading order', () => {
    const books = [sb('b1', '1'), sb('b2-a', '2', 'A'), sb('b2-b', '2', 'B')];
    expect(next(current('b1', '1'), books)?.book.item.id).toBe('b2-a');
    expect(next(current('b1', '1'), books, progress({ 'b2-b': 'begun' }))?.book.item.id).toBe('b2-b');
  });

  it('treats a place as done when any book at it is finished', () => {
    const books = [sb('b1', '1'), sb('b2-a', '2', 'A'), sb('b2-b', '2', 'B'), sb('b3', '3')];
    expect(next(current('b1', '1'), books, progress({ 'b2-b': 'finished' }))?.book.item.id).toBe('b3');
  });

  it('after an omnibus, offers the book after its last part', () => {
    const books = [sb('b1', '1'), sb('omni', '2-3'), sb('b2', '2'), sb('b3', '3'), sb('b4', '4')];
    expect(next(current('omni', '2-3'), books)?.book.item.id).toBe('b4');
  });

  it('does not offer an omnibus that repeats the book just finished', () => {
    const books = [sb('b1', '1'), sb('omni', '1-3'), sb('b2', '2')];
    expect(next(current('b1', '1'), books)?.book.item.id).toBe('b2');
  });

  it('has nothing to offer before the series books have loaded', () => {
    expect(nextInSeries(current('b1', '1'), new Map(), new Map())).toBeUndefined();
  });

  it('has nothing to offer for a book in no series', () => {
    expect(nextInSeries({ id: 'b1', series: [] }, new Map(), new Map())).toBeUndefined();
  });
});

describe('nextInSeries: a book in several series', () => {
  // Mort is Discworld #4 and Death #1; Reaper Man is Discworld #11 and Death #2.
  const discworld = [sb('dw1', '1'), sb('dw2', '2'), sb('dw3', '3'), sb('mort', '4'), sb('dw5', '5')];
  const death = [sb('mort', '1'), sb('reaper', '2')];
  const mort = {
    id: 'mort',
    series: [
      { id: 'DW', name: 'Discworld', sequence: '4' },
      { id: 'D', name: 'Death', sequence: '1' },
    ],
  };
  const books = new Map([series('DW', ...discworld), series('D', ...death)]);

  it('follows the series whose earlier books you have listened to', () => {
    const p = progress({ dw1: 'finished', dw2: 'finished', dw3: 'finished' });
    expect(nextInSeries(mort, books, p)).toMatchObject({
      series: { name: 'Discworld' },
      book: { item: { id: 'dw5' } },
    });
  });

  it('follows a sub-series read in its own order over the main series', () => {
    // Reaper Man (Discworld #11, Death #2) after Mort: of the Death books before it, all heard; of Discworld's, few.
    const dw = [
      ...Array.from({ length: 10 }, (_, i) => sb(`dw${i + 1}`, String(i + 1))),
      sb('reaper', '11'),
      sb('dw12', '12'),
    ];
    const d = [sb('dw4', '1'), sb('reaper', '2'), sb('soul', '3')]; // dw4 is Mort
    const reaper = {
      id: 'reaper',
      series: [
        { id: 'DW', name: 'Discworld', sequence: '11' },
        { id: 'D', name: 'Death', sequence: '2' },
      ],
    };
    const got = nextInSeries(reaper, new Map([series('DW', ...dw), series('D', ...d)]), progress({ dw4: 'finished' }));
    expect(got).toMatchObject({ series: { name: 'Death' }, book: { item: { id: 'soul' } } });
  });

  it('with nothing to tell them apart, takes the series listed first', () => {
    const fresh = { ...mort, series: [mort.series[1], mort.series[0]] };
    expect(nextInSeries(fresh, books, new Map())?.series.name).toBe('Death');
    expect(nextInSeries(mort, books, new Map())?.series.name).toBe('Discworld');
  });

  it('passes over a series with nothing left to offer', () => {
    const p = progress({ dw1: 'finished', dw2: 'finished', dw3: 'finished', dw5: 'finished' });
    expect(nextInSeries(mort, books, p)).toMatchObject({ series: { name: 'Death' }, book: { item: { id: 'reaper' } } });
  });

  it('passes over a series in which this book has no place', () => {
    const odd = { ...mort, series: [{ id: 'DW', name: 'Discworld', sequence: null }, mort.series[1]] };
    expect(nextInSeries(odd, books, new Map())?.series.name).toBe('Death');
  });

  it('uses the series it can, while another is still loading', () => {
    expect(nextInSeries(mort, new Map([series('D', ...death)]), new Map())?.series.name).toBe('Death');
  });
});

describe('bookInSeries', () => {
  it('says which book of which series', () => {
    expect(bookInSeries('2', 'Sherlock Holmes')).toBe('Book 2 of Sherlock Holmes');
    expect(bookInSeries('1.5', 'Sherlock Holmes')).toBe('Book 1.5 of Sherlock Holmes');
    expect(bookInSeries('2-3', 'Sherlock Holmes')).toBe('Books 2-3 of Sherlock Holmes');
  });
  it('leaves the series out when it is said already', () => {
    expect(bookInSeries('2')).toBe('Book 2');
  });
});
