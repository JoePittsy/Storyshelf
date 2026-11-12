// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetKeptSleep, keepSleep, keptSleep, SLEEP_KEPT_KEY, SLEEP_KEPT_MAX_AGE_MS } from './sleepKept';

const T0 = 1_000_000;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the sleep timer kept on the device', () => {
  it('keeps a minutes timer with the time it has left, and the length it was set to', () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 840_000, minutes: 15 }, T0);
    expect(keptSleep('li_1', T0 + 1000)).toEqual({ kind: 'minutes', remainingMs: 840_000, minutes: 15 });
  });

  it('an extended timer has no length: it comes back without one', () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 1_800_000 }, T0);
    expect(keptSleep('li_1', T0)).toEqual({ kind: 'minutes', remainingMs: 1_800_000 });
  });

  it('keeps only that an end-of-chapter timer was running: where it ends depends on where Play starts', () => {
    keepSleep('li_1', { kind: 'chapter', endsAt: 300 }, T0);
    expect(keptSleep('li_1', T0)).toEqual({ kind: 'chapter' });
  });

  it('keeps one timer: the latest', () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 }, T0);
    keepSleep('li_2', { kind: 'chapter', endsAt: 300 }, T0);
    expect(keptSleep('li_1', T0)).toBeNull();
    expect(keptSleep('li_2', T0)).toEqual({ kind: 'chapter' });
  });

  it('is for one book only', () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 }, T0);
    expect(keptSleep('li_2', T0)).toBeNull();
  });

  it('comes back for a few hours after it was last kept, and then not', () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 }, T0);
    expect(keptSleep('li_1', T0 + SLEEP_KEPT_MAX_AGE_MS)).not.toBeNull();
    expect(keptSleep('li_1', T0 + SLEEP_KEPT_MAX_AGE_MS + 1)).toBeNull();
    expect(keptSleep('li_1', T0 - 1)).toBeNull(); // kept "in the future": the clock was set back
  });

  it('is forgotten when it is turned off, ran out, or the user signs out', () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 }, T0);
    forgetKeptSleep();
    expect(keptSleep('li_1', T0)).toBeNull();
    expect(localStorage.getItem(SLEEP_KEPT_KEY)).toBeNull();
  });

  it("is another user's, or another server's, when who is signed in has changed", () => {
    keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 }, T0);
    localStorage.setItem('storyshelf.lastUser', JSON.stringify({ id: 'u2', username: 'ann', server: 'same-origin' }));
    expect(keptSleep('li_1', T0)).toBeNull();
  });

  it('nothing left, or nonsense, is no timer', () => {
    const put = (timer: unknown, extra: object = {}) =>
      localStorage.setItem(
        SLEEP_KEPT_KEY,
        JSON.stringify({ owner: 'same-origin|', itemId: 'li_1', savedAt: T0, timer, ...extra })
      );
    put({ kind: 'minutes', remainingMs: 0 });
    expect(keptSleep('li_1', T0)).toBeNull();
    put({ kind: 'minutes', remainingMs: -5 });
    expect(keptSleep('li_1', T0)).toBeNull();
    put({ kind: 'minutes', remainingMs: 'soon' });
    expect(keptSleep('li_1', T0)).toBeNull();
    put({ kind: 'minutes', remainingMs: 7 * 24 * 3_600_000 });
    expect(keptSleep('li_1', T0)).toBeNull();
    put({ kind: 'forever' });
    expect(keptSleep('li_1', T0)).toBeNull();
    put(null);
    expect(keptSleep('li_1', T0)).toBeNull();
    put({ kind: 'minutes', remainingMs: 60_000 }, { savedAt: 'yesterday' });
    expect(keptSleep('li_1', T0)).toBeNull();
    localStorage.setItem(SLEEP_KEPT_KEY, '{not json');
    expect(keptSleep('li_1', T0)).toBeNull();
    localStorage.setItem(SLEEP_KEPT_KEY, '"a string"');
    expect(keptSleep('li_1', T0)).toBeNull();
  });
});

describe('storage that fails', () => {
  it('keeping, forgetting and reading never throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => keepSleep('li_1', { kind: 'minutes', remainingMs: 600_000 })).not.toThrow();
    expect(() => forgetKeptSleep()).not.toThrow();
    expect(keptSleep('li_1')).toBeNull();
  });
});
