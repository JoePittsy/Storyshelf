/**
 * Tests for the sleep timer.
 * Code under test: apps/web/src/player/sleep.ts
 *
 * Requirements covered (IDs appear in the test names):
 *  REQ-20 Sleep timer, in minutes or at the end of the chapter.
 *         "End of chapter" pauses when Chapter 7 ends.
 *
 * Design facts: `tickSleep` is only called while playing and is fed real playing
 * milliseconds, so the 'minutes' timer counts only what it is given (a paused
 * player does not drain it). The 'chapter' timer ignores elapsed ms and expires
 * on book time: bookTime >= endsAt - 0.5.
 */
import { describe, expect, it } from 'vitest';
import type { Chapter } from './chapters';
import { sleepAtChapterEnd, sleepInMinutes, tickSleep } from './sleep';

// Ten chapters of 300 s: chapter N (1-based) covers (N-1)*300 .. N*300.
const CHAPTERS: Chapter[] = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  start: i * 300,
  end: (i + 1) * 300,
  title: `Chapter ${i + 1}`,
}));

describe('REQ-20: sleepInMinutes', () => {
  it('REQ-20: 30 minutes becomes a minutes timer of 1,800,000 ms that remembers its length', () => {
    // The length is kept so the sleep list can tick the row that was chosen while it counts down.
    expect(sleepInMinutes(30), 'Expected a minutes timer holding 30 * 60 * 1000 ms').toEqual({
      kind: 'minutes',
      remainingMs: 1_800_000,
      minutes: 30,
    });
  });

  it('REQ-20: fractional minutes are honoured', () => {
    expect(sleepInMinutes(0.5), 'Expected half a minute to be 30,000 ms').toEqual({
      kind: 'minutes',
      remainingMs: 30_000,
      minutes: 0.5,
    });
  });
});

describe('REQ-20: sleepAtChapterEnd', () => {
  it('REQ-20: ends at the end of the chapter containing the current time', () => {
    // 1850 s is inside Chapter 7 (1800-2100).
    expect(sleepAtChapterEnd(CHAPTERS, 1850), 'Expected endsAt to be the end of Chapter 7 (2100)').toEqual({
      kind: 'chapter',
      endsAt: 2100,
    });
  });

  it('REQ-20: at the exact start of a chapter it ends that chapter, not the previous one', () => {
    expect(sleepAtChapterEnd(CHAPTERS, 1800), 'Expected the chapter starting at 1800 to end at 2100').toEqual({
      kind: 'chapter',
      endsAt: 2100,
    });
  });

  it('REQ-20: in the last chapter it ends at the end of the book', () => {
    expect(sleepAtChapterEnd(CHAPTERS, 2900), 'Expected endsAt to be the end of the last chapter (3000)').toEqual({
      kind: 'chapter',
      endsAt: 3000,
    });
  });

  it('REQ-20: at the very end of the last chapter it still ends at that chapter end', () => {
    expect(sleepAtChapterEnd(CHAPTERS, 3000), 'Expected t == end of the last chapter to give endsAt 3000').toEqual({
      kind: 'chapter',
      endsAt: 3000,
    });
  });

  it('REQ-20: returns null when the book has no chapters', () => {
    expect(sleepAtChapterEnd([], 100), 'Expected null so the UI can hide "end of chapter"').toBeNull();
  });
});

describe('REQ-20: tickSleep with a minutes timer', () => {
  it('REQ-20: reduces the remaining time by the playing ms it is fed', () => {
    const { timer, expired } = tickSleep(sleepInMinutes(30), 1000, 0);
    expect(timer, 'Expected 1,799,000 ms remaining after feeding 1000 ms').toEqual({
      kind: 'minutes',
      remainingMs: 1_799_000,
      minutes: 30,
    });
    expect(expired, 'Expected the timer not to have expired yet').toBe(false);
  });

  it('REQ-20: counts only the ms it is fed, so feeding 0 changes nothing', () => {
    const { timer, expired } = tickSleep(sleepInMinutes(30), 0, 0);
    expect(timer, 'Expected no change when no playing time has passed (for example while paused)').toEqual({
      kind: 'minutes',
      remainingMs: 1_800_000,
      minutes: 30,
    });
    expect(expired, 'Expected no expiry without playing time').toBe(false);
  });

  it('REQ-20: ignores book time (a big book time does not expire a minutes timer)', () => {
    const { expired } = tickSleep(sleepInMinutes(30), 1000, 999_999);
    expect(expired, 'Expected a minutes timer to depend only on playing ms').toBe(false);
  });

  it('REQ-20: successive ticks accumulate', () => {
    let state = tickSleep(sleepInMinutes(1), 20_000, 0);
    state = tickSleep(state.timer, 20_000, 0);
    expect(state.timer, 'Expected 60,000 - 40,000 = 20,000 ms remaining').toEqual({
      kind: 'minutes',
      remainingMs: 20_000,
      minutes: 1,
    });
    expect(state.expired, 'Expected not expired with 20 s left').toBe(false);
  });

  it('REQ-20: expires when the remaining time reaches exactly 0', () => {
    const { timer, expired } = tickSleep(sleepInMinutes(1), 60_000, 0);
    expect(expired, 'Expected expiry at remainingMs == 0').toBe(true);
    expect(timer.kind === 'minutes' && timer.remainingMs <= 0, 'Expected remainingMs <= 0 after expiry').toBe(true);
  });

  it('REQ-20: expires when a tick overshoots the remaining time', () => {
    const { expired } = tickSleep(sleepInMinutes(1), 75_000, 0);
    expect(expired, 'Expected expiry when more ms are fed than remain').toBe(true);
  });

  it('REQ-20: does not expire with 1 ms left', () => {
    const { expired } = tickSleep(sleepInMinutes(1), 59_999, 0);
    expect(expired, 'Expected 1 ms remaining not to be expired').toBe(false);
  });
});

describe('REQ-20: tickSleep with an end-of-chapter timer', () => {
  const timer = { kind: 'chapter', endsAt: 2100 } as const; // end of Chapter 7

  it('REQ-20: does not expire in the middle of the chapter', () => {
    expect(tickSleep(timer, 1000, 1850).expired, 'Expected Chapter 7 not to have ended at 1850 s').toBe(false);
  });

  it('REQ-20: pauses when Chapter 7 ends (book time reaches endsAt)', () => {
    expect(tickSleep(timer, 1000, 2100).expired, 'Expected expiry at the chapter end').toBe(true);
  });

  it('REQ-20: expires slightly before the end (0.5 s tolerance for timeupdate granularity)', () => {
    expect(tickSleep(timer, 1000, 2099.5).expired, 'Expected expiry at endsAt - 0.5').toBe(true);
  });

  it('REQ-20: does not expire just outside the tolerance', () => {
    expect(tickSleep(timer, 1000, 2099.49).expired, 'Expected no expiry before endsAt - 0.5').toBe(false);
  });

  it('REQ-20: ignores playing ms, so a long tick mid-chapter does not expire it', () => {
    expect(tickSleep(timer, 10_000_000, 1850).expired, 'Expected a chapter timer to depend only on book time').toBe(
      false
    );
  });

  it('REQ-20: returns the timer unchanged', () => {
    expect(tickSleep(timer, 1000, 1850).timer, 'Expected the chapter timer to keep its endsAt').toEqual({
      kind: 'chapter',
      endsAt: 2100,
    });
  });

  it('REQ-20: a timer set in the last chapter expires at the end of the book', () => {
    const last = sleepAtChapterEnd(CHAPTERS, 2900);
    expect(last, 'Expected a timer in the last chapter').not.toBeNull();
    if (!last) return;
    expect(tickSleep(last, 1000, 2950).expired, 'Expected no expiry mid last chapter').toBe(false);
    expect(tickSleep(last, 1000, 3000).expired, 'Expected expiry at the end of the book').toBe(true);
  });
});
