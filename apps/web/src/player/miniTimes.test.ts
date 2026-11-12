import { describe, expect, it } from 'vitest';
import { miniPlayerTimes, sleepStopsIn } from './miniTimes';

const chapters = [
  { id: 0, start: 0, end: 1038, title: 'Part I' },
  { id: 1, start: 1038, end: 2427, title: 'Part II' },
  { id: 2, start: 2427, end: 3784, title: 'Part III' },
];
const at = (position: number, more: Partial<Parameters<typeof miniPlayerTimes>[0]> = {}) =>
  miniPlayerTimes({ position, duration: 3784, chapters, chapterIndex: 0, sleep: null, rate: 1, ...more });

describe('miniPlayerTimes', () => {
  it('in a chapter: the time left in it after the chapter name, and the book’s time left on the wide bar', () => {
    // 1038 - 311 = 727 s, 12 whole minutes; 3784 - 311 = 3473 s, 57 minutes.
    expect(at(311)).toEqual({ remaining: '12m left in chapter', side: '57m left in book' });
  });

  it('with no chapters: the book’s time left, and the wide bar leaves its own readout alone', () => {
    expect(at(311, { chapters: [], chapterIndex: -1 })).toEqual({ remaining: '57m left', side: undefined });
  });

  it('in a gap between chapters: the book’s time left', () => {
    expect(at(311, { chapterIndex: -1 })).toEqual({ remaining: '57m left', side: '57m left in book' });
  });

  it('with a sleep timer: the wide bar says when it stops instead', () => {
    expect(at(311, { sleep: { kind: 'minutes', remainingMs: 510_000 } }).side).toBe('Stops in 8:30');
    // An end-of-chapter timer stops half a second before the chapter ends, sooner at a higher speed.
    expect(at(311, { sleep: { kind: 'chapter', endsAt: 1038 } }).side).toBe('Stops in 12:07');
    expect(at(311, { sleep: { kind: 'chapter', endsAt: 1038 }, rate: 2 }).side).toBe('Stops in 6:04');
  });

  it('says nothing while the length is unknown', () => {
    expect(at(0, { duration: 0, chapters: [], chapterIndex: -1 })).toEqual({ remaining: undefined, side: undefined });
  });
});

describe('sleepStopsIn', () => {
  it('says nothing without a timer, and otherwise what the mini player says (car mode shares it)', () => {
    expect(sleepStopsIn(null, 311, 1)).toBeUndefined();
    expect(sleepStopsIn({ kind: 'minutes', remainingMs: 750_000 }, 311, 1)).toBe('Stops in 12:30');
    expect(sleepStopsIn({ kind: 'chapter', endsAt: 1038 }, 311, 2)).toBe('Stops in 6:04');
    expect(sleepStopsIn({ kind: 'minutes', remainingMs: 510_000 }, 311, 1)).toBe(
      at(311, { sleep: { kind: 'minutes', remainingMs: 510_000 } }).side
    );
  });
});
