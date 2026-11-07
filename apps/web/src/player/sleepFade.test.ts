// The sleep timer fades the volume out over its last seconds, rather than cutting off mid-sentence.
import { describe, expect, it } from 'vitest';
import { FADE_MS, fadeLevel, sleepRemainingMs } from './sleep';

describe('sleepRemainingMs: real time until the timer stops playback', () => {
  it('a minutes timer counts real time already', () => {
    expect(sleepRemainingMs({ kind: 'minutes', remainingMs: 8000 }, 500, 1.5)).toBe(8000);
  });

  it('an end-of-chapter timer stops half a second before the chapter end, and speed shortens the wait', () => {
    // 20.5 book seconds to the end, less the half second: 20 book seconds.
    expect(sleepRemainingMs({ kind: 'chapter', endsAt: 120.5 }, 100, 1)).toBe(20_000);
    expect(sleepRemainingMs({ kind: 'chapter', endsAt: 120.5 }, 100, 2)).toBe(10_000);
  });

  it('never below 0', () => {
    expect(sleepRemainingMs({ kind: 'chapter', endsAt: 100 }, 150, 1)).toBe(0);
    expect(sleepRemainingMs({ kind: 'minutes', remainingMs: -40 }, 0, 1)).toBe(0);
  });
});

describe('fadeLevel: the volume, as a share of the listener’s own, for the time left', () => {
  it('fades over the last 10 seconds', () => {
    expect(FADE_MS).toBe(10_000);
  });

  it('full volume until the fade starts', () => {
    expect(fadeLevel(60_000)).toBe(1);
    expect(fadeLevel(FADE_MS)).toBe(1);
  });

  it('falls as the end nears, faster at first (a curve the ear hears as even)', () => {
    expect(fadeLevel(FADE_MS / 2)).toBeCloseTo(0.25);
    expect(fadeLevel(FADE_MS * 0.9)).toBeCloseTo(0.81);
    expect(fadeLevel(1000)).toBeLessThan(fadeLevel(2000));
  });

  it('silent at the end, and never below 0 or above 1', () => {
    expect(fadeLevel(0)).toBe(0);
    expect(fadeLevel(-500)).toBe(0);
    expect(fadeLevel(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
