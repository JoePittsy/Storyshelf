// Rewinding a little when playback resumes after a pause, so the listener picks the thread back up.
import { describe, expect, it } from 'vitest';
import type { Chapter } from './chapters';
import { rewindSeconds, rewindTarget } from './rewind';

const S = 1000;
const MIN = 60 * S;
const HOUR = 60 * MIN;

describe('rewindSeconds: how far back for a pause of this length', () => {
  it('nothing after a short pause (under 10 seconds)', () => {
    expect(rewindSeconds(0)).toBe(0);
    expect(rewindSeconds(3 * S)).toBe(0);
    expect(rewindSeconds(9.9 * S)).toBe(0);
  });

  it('5 seconds after a pause of 10 seconds up to 5 minutes', () => {
    expect(rewindSeconds(10 * S)).toBe(5);
    expect(rewindSeconds(2 * MIN)).toBe(5);
    expect(rewindSeconds(5 * MIN - 1)).toBe(5);
  });

  it('15 seconds after a pause of 5 minutes up to an hour', () => {
    expect(rewindSeconds(5 * MIN)).toBe(15);
    expect(rewindSeconds(40 * MIN)).toBe(15);
  });

  it('30 seconds after an hour or more, and never more than that', () => {
    expect(rewindSeconds(HOUR)).toBe(30);
    expect(rewindSeconds(9 * HOUR)).toBe(30);
    expect(rewindSeconds(30 * 24 * HOUR)).toBe(30);
  });

  it('nothing for a pause it cannot measure (negative from clock skew, or not a number)', () => {
    expect(rewindSeconds(-5 * MIN)).toBe(0);
    expect(rewindSeconds(Number.NaN)).toBe(0);
  });
});

// Chapter 1 is 0..300, chapter 2 is 300..900; a gap from 900 to 1000, then chapter 3 is 1000..1500.
const CHAPTERS: Chapter[] = [
  { id: 0, start: 0, end: 300, title: 'One' },
  { id: 1, start: 300, end: 900, title: 'Two' },
  { id: 2, start: 1000, end: 1500, title: 'Three' },
];

describe('rewindTarget: where playback resumes', () => {
  it('goes back the given seconds', () => {
    expect(rewindTarget(500, 15, CHAPTERS)).toBe(485);
  });

  it('never before the start of the current chapter', () => {
    expect(rewindTarget(310, 30, CHAPTERS)).toBe(300);
  });

  it('stays put at the very start of a chapter', () => {
    expect(rewindTarget(300, 30, CHAPTERS)).toBe(300);
  });

  it('never before 0', () => {
    expect(rewindTarget(4, 30, CHAPTERS)).toBe(0);
    expect(rewindTarget(4, 30, [])).toBe(0);
  });

  it('with no chapters, only 0 holds it back', () => {
    expect(rewindTarget(500, 30, [])).toBe(470);
  });

  it('in a gap between chapters, not before the gap starts (the end of the chapter before)', () => {
    expect(rewindTarget(910, 30, CHAPTERS)).toBe(900);
    expect(rewindTarget(960, 30, CHAPTERS)).toBe(930);
  });

  it('no rewind leaves the place exactly where it was', () => {
    expect(rewindTarget(123.4, 0, CHAPTERS)).toBe(123.4);
  });
});
