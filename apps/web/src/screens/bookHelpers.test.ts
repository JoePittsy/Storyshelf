// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { currentChapterIndex, fmtClock, fmtLong, playFrom, playLabel, sanitiseDescription } from './bookHelpers';

const chapters = [
  { id: 0, start: 10, end: 100, title: 'One' },
  { id: 1, start: 100, end: 200, title: 'Two' },
];

describe('REQ-13 time formatting', () => {
  it('formats time left as Xh Ym or Ym', () => {
    expect(fmtLong(4 * 3600 + 12 * 60 + 30)).toBe('4h 12m');
    expect(fmtLong(59 * 60 + 59)).toBe('59m');
    expect(fmtLong(3600)).toBe('1h 0m');
    expect(fmtLong(-5)).toBe('0m');
  });
  it('formats clock times', () => {
    expect(fmtClock(3730)).toBe('1:02:10');
    expect(fmtClock(65, false)).toBe('1:05');
    expect(fmtClock(65)).toBe('0:01:05');
  });
});

describe('REQ-15 current chapter', () => {
  it('is the chapter containing the time', () => expect(currentChapterIndex(chapters, 150)).toBe(1));
  it('switches exactly at a chapter start', () => {
    expect(currentChapterIndex(chapters, 100)).toBe(1);
    expect(currentChapterIndex(chapters, 99.9)).toBe(0);
  });
  it('is -1 before the first chapter', () => expect(currentChapterIndex(chapters, 5)).toBe(-1));
  it('is -1 at or after the end', () => {
    expect(currentChapterIndex(chapters, 200)).toBe(-1);
    expect(currentChapterIndex(chapters, 999)).toBe(-1);
  });
  it('is -1 with no chapters', () => expect(currentChapterIndex([], 5)).toBe(-1));
});

describe('REQ-14 button label', () => {
  it('Play when not started', () => {
    expect(playLabel(undefined)).toBe('Play');
    expect(playLabel(null)).toBe('Play');
    expect(playLabel({ currentTime: 0, isFinished: false })).toBe('Play');
  });
  it('Resume at 1:02:10', () => {
    const p = { currentTime: 3730, isFinished: false };
    expect(playLabel(p)).toBe('Resume');
    expect(playFrom(p)).toBe(3730);
  });
  it('Play again when finished, from the start', () => {
    const p = { currentTime: 9999, isFinished: true };
    expect(playLabel(p)).toBe('Play again');
    expect(playFrom(p)).toBe(0);
  });
});

describe('description sanitising', () => {
  it('strips script and event handlers but keeps formatting', () => {
    const out = sanitiseDescription('<p>Hi <b>there</b></p><script>alert(1)</script><img src=x onerror="alert(2)">');
    expect(out).not.toMatch(/script|onerror|alert/);
    expect(out).toContain('<b>there</b>');
  });
});
