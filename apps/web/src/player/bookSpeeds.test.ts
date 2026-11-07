// @vitest-environment jsdom
// Each book keeps the speed it was last played at, on this device. Books never set follow the default.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

let mod: typeof import('./bookSpeeds');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  mod = await import('./bookSpeeds');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('book speeds', () => {
  it('remembers a speed for the book it was set on, and only that book', () => {
    mod.rememberBookSpeed('b1', 1.5, 1);
    expect(mod.bookSpeed('b1')).toBe(1.5);
    expect(mod.bookSpeed('b2')).toBeUndefined();
  });

  it('a speed equal to the default is forgotten, so the book follows the default from then on', () => {
    mod.rememberBookSpeed('b1', 1.5, 1);
    mod.rememberBookSpeed('b1', 1, 1);
    expect(mod.bookSpeed('b1')).toBeUndefined();
  });

  it('a speed equal to the default is not stored in the first place', () => {
    mod.rememberBookSpeed('b1', 1.2, 1.2);
    expect(mod.bookSpeed('b1')).toBeUndefined();
    expect(localStorage.getItem('storyshelf.bookSpeeds') ?? '[]').toBe('[]');
  });

  it('survives a reload', async () => {
    mod.rememberBookSpeed('b1', 1.3, 1);
    vi.resetModules();
    const again = await import('./bookSpeeds');
    expect(again.bookSpeed('b1')).toBe(1.3);
  });

  it('keeps only the most recently set books, so storage never grows without end', () => {
    for (let i = 0; i < mod.MAX_BOOK_SPEEDS + 5; i++) mod.rememberBookSpeed(`b${i}`, 1.5, 1);
    expect(mod.bookSpeed('b0')).toBeUndefined();
    expect(mod.bookSpeed('b4')).toBeUndefined();
    expect(mod.bookSpeed('b5')).toBe(1.5);
    expect(mod.bookSpeed(`b${mod.MAX_BOOK_SPEEDS + 4}`)).toBe(1.5);
  });

  it('setting a book again makes it the most recent, so the cap drops older ones first', () => {
    for (let i = 0; i < mod.MAX_BOOK_SPEEDS; i++) mod.rememberBookSpeed(`b${i}`, 1.5, 1);
    mod.rememberBookSpeed('b0', 1.7, 1); // b0 is now newest
    mod.rememberBookSpeed('new', 1.5, 1); // pushes out b1, the oldest
    expect(mod.bookSpeed('b0')).toBe(1.7);
    expect(mod.bookSpeed('b1')).toBeUndefined();
  });

  it('reset forgets them all, hands back what it forgot, and that can be put back', () => {
    mod.rememberBookSpeed('b1', 1.5, 1);
    mod.rememberBookSpeed('b2', 0.9, 1);
    const was = mod.forgetBookSpeeds();
    expect(mod.bookSpeed('b1')).toBeUndefined();
    expect(mod.bookSpeed('b2')).toBeUndefined();
    mod.putBackBookSpeeds(was);
    expect(mod.bookSpeed('b1')).toBe(1.5);
    expect(mod.bookSpeed('b2')).toBe(0.9);
  });

  it('counts the stored books for Settings, and updates as they change', () => {
    const { result } = renderHook(() => mod.useBookSpeedCount());
    expect(result.current).toBe(0);
    act(() => mod.rememberBookSpeed('b1', 1.5, 1));
    act(() => mod.rememberBookSpeed('b2', 1.5, 1));
    expect(result.current).toBe(2);
    act(() => void mod.forgetBookSpeeds());
    expect(result.current).toBe(0);
  });

  it('ignores junk in storage: bad entries are dropped, speeds are clamped to the player range', async () => {
    localStorage.setItem(
      'storyshelf.bookSpeeds',
      JSON.stringify([['b1', 9], ['b2', 'fast'], [3, 1.5], 'nope', ['b3', 1.25]]),
    );
    vi.resetModules();
    const again = await import('./bookSpeeds');
    expect(again.bookSpeed('b1')).toBe(3);
    expect(again.bookSpeed('b2')).toBeUndefined();
    expect(again.bookSpeed('b3')).toBe(1.3);
  });

  it('ignores storage it cannot read', async () => {
    localStorage.setItem('storyshelf.bookSpeeds', '{not json');
    vi.resetModules();
    const again = await import('./bookSpeeds');
    expect(again.bookSpeed('b1')).toBeUndefined();
  });

  it('still works for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mod.rememberBookSpeed('b1', 1.5, 1);
    expect(mod.bookSpeed('b1')).toBe(1.5);
  });
});
