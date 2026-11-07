import { describe, it, expect } from 'vitest';
import type { ListeningSession } from '../api/history';
import { addMark, historyRows, sessionMarks, MAX_JUMP_MARKS } from './bookHistory';

const session = (o: Partial<ListeningSession>): ListeningSession => ({
  id: 's',
  libraryItemId: 'book',
  mediaType: 'book',
  displayTitle: 'Book',
  displayAuthor: null,
  timeListening: 0,
  startTime: 0,
  currentTime: 0,
  startedAt: 1000,
  updatedAt: 2000,
  ...o,
});

const NOW = 1_000_000;
const base = { itemId: 'book', jumps: [], now: NOW };

describe('sessionMarks', () => {
  it('gives each session of the book a start and an end', () => {
    const marks = sessionMarks([session({ startTime: 100, currentTime: 900, startedAt: 10, updatedAt: 20 })], 'book');
    expect(marks).toEqual([
      { position: 100, at: 10 },
      { position: 900, at: 20 },
    ]);
  });

  it('ignores a null link, a podcast and another book', () => {
    const marks = sessionMarks(
      [
        session({ libraryItemId: null, startTime: 1000 }),
        session({ mediaType: 'podcast', startTime: 2000 }),
        session({ libraryItemId: 'other', startTime: 3000 }),
      ],
      'book'
    );
    expect(marks).toEqual([]);
  });
});

describe('historyRows', () => {
  it('leads with the current position, then the rest newest first', () => {
    const rows = historyRows({
      ...base,
      position: 5000,
      sessions: [
        session({ startTime: 100, currentTime: 900, startedAt: 10_000, updatedAt: 20_000 }),
        session({ id: 't', startTime: 2000, currentTime: 3000, startedAt: 500_000, updatedAt: 600_000 }),
      ],
    });
    expect(rows.map((r) => [r.current, r.position])).toEqual([
      [true, 5000],
      [false, 3000],
      [false, 2000],
      [false, 900],
      [false, 100],
    ]);
    expect(rows[0]).toMatchObject({ key: 'now', at: NOW });
  });

  it("merges this visit's jump marks with the sessions by time", () => {
    const rows = historyRows({
      ...base,
      position: 9000,
      sessions: [session({ startTime: 100, currentTime: 200, startedAt: 10, updatedAt: 20 })],
      jumps: [{ position: 4000, at: 900_000 }],
    });
    expect(rows.slice(1).map((r) => r.position)).toEqual([4000, 200, 100]);
  });

  it('drops a point within the window of where the book is now', () => {
    const rows = historyRows({
      ...base,
      position: 3000,
      sessions: [session({ startTime: 100, currentTime: 3020, startedAt: 10, updatedAt: 20 })],
    });
    expect(rows.map((r) => r.position)).toEqual([3000, 100]);
  });

  it('collapses points within 30s of each other, keeping the newer, but not ones further apart', () => {
    const rows = historyRows({
      ...base,
      position: 9000,
      sessions: [],
      jumps: [
        { position: 1010, at: 100 },
        { position: 1030, at: 200 },
        { position: 1031, at: 300 },
      ],
    });
    expect(rows.slice(1).map((r) => r.position)).toEqual([1031]);
    const apart = historyRows({
      ...base,
      position: 9000,
      sessions: [],
      jumps: [
        { position: 1000, at: 100 },
        { position: 1100, at: 200 },
      ],
    });
    expect(apart.slice(1).map((r) => r.position)).toEqual([1100, 1000]);
  });

  it('marks only the first row as current and has just it for a book with no history', () => {
    const rows = historyRows({ ...base, position: 0, sessions: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.current).toBe(true);
    const more = historyRows({ ...base, position: 0, sessions: [session({ startTime: 500, currentTime: 700 })] });
    expect(more.filter((r) => r.current)).toHaveLength(1);
  });

  it('ignores sessions for another book, a podcast and a lost link', () => {
    const rows = historyRows({
      ...base,
      position: 0,
      sessions: [
        session({ libraryItemId: null, startTime: 500 }),
        session({ mediaType: 'podcast', startTime: 1500 }),
        session({ libraryItemId: 'x', startTime: 2500 }),
      ],
    });
    expect(rows).toHaveLength(1);
  });
});

describe('addMark', () => {
  it('keeps the newest marks up to the cap', () => {
    let marks: ReturnType<typeof addMark> = [];
    for (let i = 0; i < MAX_JUMP_MARKS + 5; i++) marks = addMark(marks, { position: i * 100, at: i * 5000 });
    expect(marks).toHaveLength(MAX_JUMP_MARKS);
    expect(marks[marks.length - 1]?.position).toBe((MAX_JUMP_MARKS + 4) * 100);
  });

  it('does not repeat the same place straight away', () => {
    const once = addMark([], { position: 100, at: 1000 });
    expect(addMark(once, { position: 100.4, at: 1200 })).toBe(once);
  });
});
