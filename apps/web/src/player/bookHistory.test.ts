import { describe, it, expect } from 'vitest';
import type { ListeningSession } from '../api/history';
import { addMark, historyEntries, MAX_JUMP_MARKS } from './bookHistory';

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

const base = { itemId: 'book', jumps: [] };

describe('historyEntries', () => {
  it('lists each session of the book as a stretch from one place to another, newest first', () => {
    const entries = historyEntries({
      ...base,
      position: 5000,
      sessions: [
        session({
          id: 'a',
          startTime: 100,
          currentTime: 900,
          startedAt: 10_000,
          updatedAt: 20_000,
          timeListening: 800,
        }),
        session({ id: 'b', startTime: 2000, currentTime: 3000, startedAt: 500_000, updatedAt: 600_000 }),
      ],
    });
    expect(entries.map((e) => (e.kind === 'session' ? [e.from, e.to, e.at] : null))).toEqual([
      [2000, 3000, 600_000],
      [100, 900, 20_000],
    ]);
    expect(entries[1]).toMatchObject({ kind: 'session', startedAt: 10_000, listened: 800 });
  });

  it("puts this visit's jump marks among the sessions by time", () => {
    const entries = historyEntries({
      ...base,
      position: 9000,
      sessions: [session({ startTime: 100, currentTime: 200, startedAt: 10, updatedAt: 20 })],
      jumps: [{ position: 4000, at: 900_000 }],
    });
    expect(entries.map((e) => e.kind)).toEqual(['jump', 'session']);
    expect(entries[0]).toMatchObject({ position: 4000 });
  });

  it('leaves out a jump mark near where the book is now, a session end or a newer mark', () => {
    const entries = historyEntries({
      ...base,
      position: 9000,
      sessions: [session({ startTime: 100, currentTime: 2000, startedAt: 10, updatedAt: 20 })],
      jumps: [
        { position: 9010, at: 100 },
        { position: 2020, at: 200 },
        { position: 5000, at: 300 },
        { position: 5020, at: 400 },
        { position: 6000, at: 500 },
      ],
    });
    expect(entries.flatMap((e) => (e.kind === 'jump' ? [e.position] : []))).toEqual([6000, 5020]);
  });

  it('leaves out a session that never moved, and ones for another book, a podcast or a lost link', () => {
    const entries = historyEntries({
      ...base,
      position: 0,
      sessions: [
        session({ startTime: 700, currentTime: 700.5 }),
        session({ libraryItemId: null, startTime: 500, currentTime: 900 }),
        session({ mediaType: 'podcast', startTime: 1500, currentTime: 1900 }),
        session({ libraryItemId: 'x', startTime: 2500, currentTime: 2900 }),
      ],
    });
    expect(entries).toEqual([]);
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
