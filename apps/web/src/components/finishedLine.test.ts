import { describe, expect, it } from 'vitest';
import { finishedLine } from './finishedLine';

const NOW = Date.UTC(2026, 10, 7, 9, 30);
const hoursAgo = (h: number) => NOW - h * 3600_000;

describe('the Finished card line', () => {
  it('gives the book length and the calendar days from the first listen to now', () => {
    expect(finishedLine(3780, hoursAgo(3 * 24), NOW, 'UTC')).toBe('1h 3m over 4 days');
  });

  it('counts calendar days, not 24 hour spans: last night to this morning is two', () => {
    expect(finishedLine(3780, Date.UTC(2026, 10, 6, 23, 0), NOW, 'UTC')).toBe('1h 3m over 2 days');
  });

  it('says a book begun and finished on the same day was heard in one day', () => {
    expect(finishedLine(2700, hoursAgo(2), NOW, 'UTC')).toBe('45m in one day');
  });

  it('leaves out what it does not know rather than guess', () => {
    expect(finishedLine(3780, undefined, NOW, 'UTC')).toBe('1h 3m');
    expect(finishedLine(3780, null, NOW, 'UTC')).toBe('1h 3m');
    expect(finishedLine(0, hoursAgo(3 * 24), NOW, 'UTC')).toBe('Over 4 days');
    expect(finishedLine(0, hoursAgo(1), NOW, 'UTC')).toBe('In one day');
    expect(finishedLine(0, undefined, NOW, 'UTC')).toBeUndefined();
  });

  it('believes a start a moment after now: the record made at the very end, or a server clock a little ahead', () => {
    expect(finishedLine(3780, NOW + 400, NOW, 'UTC')).toBe('1h 3m in one day');
  });

  it('ignores a start time that cannot be right (none, or well after now)', () => {
    expect(finishedLine(3780, 0, NOW, 'UTC')).toBe('1h 3m');
    expect(finishedLine(3780, NOW + 3600_000, NOW, 'UTC')).toBe('1h 3m');
  });

  it('says nothing about a book too short to time in minutes', () => {
    expect(finishedLine(40, undefined, NOW, 'UTC')).toBeUndefined();
  });
});
