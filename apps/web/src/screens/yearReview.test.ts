import { describe, expect, it } from 'vitest';
import { busiestMonth, monthShares, reviewCards, reviewYears, yearReview, type YearSession } from './yearReview';

const TZ = 'Europe/London';
const at = (iso: string) => Date.parse(iso);

/** A session of `minutes` heard, starting at `start` and running for the same wall-clock time unless `end` says otherwise. */
function session(over: Partial<YearSession> & { start: string; minutes: number; end?: string }): YearSession {
  const { start, minutes, end, ...rest } = over;
  const startedAt = at(start);
  return {
    libraryItemId: 'book-1',
    displayTitle: 'The Tale of Peter Rabbit',
    displayAuthor: 'Beatrix Potter',
    timeListening: minutes * 60,
    startedAt,
    updatedAt: end ? at(end) : startedAt + minutes * 60_000,
    mediaMetadata: {
      title: 'The Tale of Peter Rabbit',
      authors: [{ name: 'Beatrix Potter' }],
      narrators: ['Kate Reading'],
    },
    ...rest,
  };
}

describe('reviewYears', () => {
  it('lists the years with listening, newest first, always with this year', () => {
    expect(reviewYears({ '2024-03-01': 60, '2024-05-02': 30, '2025-12-31': 10 }, 2026)).toEqual([2026, 2025, 2024]);
  });
  it('is just this year with no listening at all', () => {
    expect(reviewYears({}, 2026)).toEqual([2026]);
  });
  it('skips a year whose only days are empty', () => {
    expect(reviewYears({ '2023-01-01': 0, '2026-02-02': 5 }, 2026)).toEqual([2026]);
  });
  it('ignores keys that are not dates', () => {
    expect(reviewYears({ nonsense: 50, '2025-01-01': 5 }, 2026)).toEqual([2026, 2025]);
  });
});

describe('monthShares', () => {
  it('puts a session inside one month all in that month', () => {
    expect(monthShares(at('2026-03-10T20:00:00Z'), at('2026-03-10T21:00:00Z'), 3600, TZ)).toEqual([
      { year: 2026, month: 2, seconds: 3600 },
    ]);
  });

  it('splits a session across New Year by the wall-clock time either side of midnight', () => {
    const shares = monthShares(at('2025-12-31T23:30:00Z'), at('2026-01-01T00:30:00Z'), 3600, TZ);
    expect(shares).toEqual([
      { year: 2025, month: 11, seconds: 1800 },
      { year: 2026, month: 0, seconds: 1800 },
    ]);
  });

  it('uses the local midnight, not UTC', () => {
    // 04:30 to 05:30 UTC on New Year's Day is 23:30 to 00:30 in New York.
    const shares = monthShares(at('2026-01-01T04:30:00Z'), at('2026-01-01T05:30:00Z'), 600, 'America/New_York');
    expect(shares).toEqual([
      { year: 2025, month: 11, seconds: 300 },
      { year: 2026, month: 0, seconds: 300 },
    ]);
  });

  it('treats an end before the start (a bad clock) as a moment at the start', () => {
    expect(monthShares(at('2026-05-01T10:00:00Z'), at('2026-04-01T10:00:00Z'), 100, TZ)).toEqual([
      { year: 2026, month: 4, seconds: 100 },
    ]);
  });

  it('has nothing for a session with no time heard', () => {
    expect(monthShares(at('2026-05-01T10:00:00Z'), at('2026-05-01T11:00:00Z'), 0, TZ)).toEqual([]);
  });
});

describe('yearReview', () => {
  it('is empty, not broken, for a year with nothing in it', () => {
    const r = yearReview([session({ start: '2025-06-01T10:00:00Z', minutes: 30 })], 2026, TZ);
    expect(r.seconds).toBe(0);
    expect(r.books).toEqual([]);
    expect(r.authors).toEqual([]);
    expect(r.narrators).toEqual([]);
    expect(r.months).toEqual(Array(12).fill(0));
    expect(r.bookCount).toBe(0);
  });

  it('adds up a year: time, months, books, authors and narrators', () => {
    const r = yearReview(
      [
        session({ start: '2026-01-05T20:00:00Z', minutes: 60 }),
        session({ start: '2026-01-06T20:00:00Z', minutes: 30 }),
        session({
          start: '2026-03-01T08:00:00Z',
          minutes: 45,
          libraryItemId: 'book-2',
          displayTitle: 'The Blue Carbuncle',
          displayAuthor: 'Arthur Conan Doyle',
          mediaMetadata: {
            title: 'The Blue Carbuncle',
            authors: [{ name: 'Arthur Conan Doyle' }],
            narrators: ['Phil Chenevert'],
          },
        }),
      ],
      2026,
      TZ
    );
    expect(r.seconds).toBe(135 * 60);
    expect(r.months[0]).toBe(90 * 60);
    expect(r.months[2]).toBe(45 * 60);
    expect(r.bookCount).toBe(2);
    expect(r.books.map((b) => [b.id, b.title, b.author, b.seconds])).toEqual([
      ['book-1', 'The Tale of Peter Rabbit', 'Beatrix Potter', 90 * 60],
      ['book-2', 'The Blue Carbuncle', 'Arthur Conan Doyle', 45 * 60],
    ]);
    expect(r.authors).toEqual([
      { name: 'Beatrix Potter', seconds: 90 * 60 },
      { name: 'Arthur Conan Doyle', seconds: 45 * 60 },
    ]);
    expect(r.narrators).toEqual([
      { name: 'Kate Reading', seconds: 90 * 60 },
      { name: 'Phil Chenevert', seconds: 45 * 60 },
    ]);
  });

  it('counts only the part of a New Year session that fell in the year', () => {
    const s = session({ start: '2025-12-31T23:00:00Z', end: '2026-01-01T01:00:00Z', minutes: 120 });
    expect(yearReview([s], 2026, TZ).seconds).toBe(3600);
    expect(yearReview([s], 2025, TZ).seconds).toBe(3600);
    expect(yearReview([s], 2025, TZ).months[11]).toBe(3600);
  });

  it('leaves unknown authors and narrators out of the rankings, but keeps the book', () => {
    const r = yearReview(
      [
        session({
          start: '2026-02-01T10:00:00Z',
          minutes: 20,
          displayAuthor: null,
          mediaMetadata: { title: 'Anonymous', authors: [], narrators: [] },
        }),
        session({
          start: '2026-02-02T10:00:00Z',
          minutes: 10,
          libraryItemId: 'b3',
          displayAuthor: '',
          mediaMetadata: null,
        }),
      ],
      2026,
      TZ
    );
    expect(r.authors).toEqual([]);
    expect(r.narrators).toEqual([]);
    expect(r.bookCount).toBe(2);
    expect(r.books[0]?.author).toBeNull();
  });

  it('falls back to the display author, split on commas, when the session has no metadata', () => {
    const r = yearReview(
      [
        session({
          start: '2026-02-01T10:00:00Z',
          minutes: 20,
          displayAuthor: 'Neil Gaiman, Terry Pratchett',
          mediaMetadata: null,
        }),
      ],
      2026,
      TZ
    );
    expect(r.authors.map((a) => a.name)).toEqual(['Neil Gaiman', 'Terry Pratchett']);
  });

  it('counts a book with several authors in full towards each', () => {
    const r = yearReview(
      [
        session({
          start: '2026-02-01T10:00:00Z',
          minutes: 20,
          mediaMetadata: {
            title: 'Good Omens',
            authors: [{ name: 'Neil Gaiman' }, { name: 'Terry Pratchett' }],
            narrators: [],
          },
        }),
      ],
      2026,
      TZ
    );
    expect(r.authors).toEqual([
      { name: 'Neil Gaiman', seconds: 1200 },
      { name: 'Terry Pratchett', seconds: 1200 },
    ]);
  });

  it('keeps a deleted book (no item id) as its own entry, by title', () => {
    const r = yearReview(
      [
        session({ start: '2026-02-01T10:00:00Z', minutes: 20, libraryItemId: null, displayTitle: 'Gone' }),
        session({ start: '2026-02-02T10:00:00Z', minutes: 10, libraryItemId: null, displayTitle: 'Gone' }),
      ],
      2026,
      TZ
    );
    expect(r.books).toHaveLength(1);
    expect(r.books[0]).toMatchObject({ id: null, seconds: 1800 });
  });

  it('reads time listened that arrives as a string, and ignores junk', () => {
    const r = yearReview(
      [
        session({ start: '2026-02-01T10:00:00Z', minutes: 0, timeListening: '600' as unknown as number }),
        session({ start: '2026-02-01T11:00:00Z', minutes: 0, timeListening: 'oops' as unknown as number }),
      ],
      2026,
      TZ
    );
    expect(r.seconds).toBe(600);
  });
});

describe('busiestMonth', () => {
  it('is the month with the most listening', () => {
    expect(busiestMonth([0, 10, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(2);
  });
  it('is null for an empty year', () => {
    expect(busiestMonth(Array(12).fill(0))).toBeNull();
  });
});

describe('reviewCards', () => {
  const r = (over: Partial<ReturnType<typeof yearReview>> = {}) => ({
    ...yearReview([], 2026, TZ),
    ...over,
  });
  it('leads with time listened, books and finished', () => {
    const cards = reviewCards(r({ seconds: 7200, bookCount: 3, months: [600, 6600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), 2);
    expect(cards.map((c) => [c.label, c.value])).toEqual([
      ['Listened', '2h 00m'],
      ['Books', '3'],
      ['Finished', '2'],
      ['Busiest month', 'February'],
    ]);
  });
  it('leaves "Finished" out while the server has not answered, rather than showing a placeholder', () => {
    const cards = reviewCards(
      r({ seconds: 60, bookCount: 1, months: [60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
      undefined
    );
    expect(cards.map((c) => c.label)).toEqual(['Listened', 'Books']);
  });
  it('leaves "Finished" out when nothing was finished: a zero card says nothing', () => {
    const cards = reviewCards(r({ seconds: 7200, bookCount: 3, months: [600, 6600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), 0);
    expect(cards.map((c) => c.label)).toEqual(['Listened', 'Books', 'Busiest month']);
  });
  it('drops "Busiest month" when there was only one month to choose from', () => {
    const cards = reviewCards(r({ seconds: 60, bookCount: 1, months: [60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), 1);
    expect(cards.map((c) => c.label)).toEqual(['Listened', 'Books', 'Finished']);
  });
});
