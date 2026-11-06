// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

let mod: typeof import('./upNextDismissed');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  mod = await import('./upNextDismissed');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('dismissing Up next', () => {
  it('sticks for the book it was dismissed on, and only that book', () => {
    const { result } = renderHook(() => [mod.useUpNextDismissed('b1'), mod.useUpNextDismissed('b2')]);
    expect(result.current).toEqual([false, false]);
    act(() => mod.dismissUpNext('b1'));
    expect(result.current).toEqual([true, false]);
  });

  it('survives a reload', async () => {
    mod.dismissUpNext('b1');
    vi.resetModules();
    const again = await import('./upNextDismissed');
    expect(renderHook(() => again.useUpNextDismissed('b1')).result.current).toBe(true);
  });

  it('keeps only the most recent books, so storage never grows without end', () => {
    for (let i = 0; i < mod.MAX_DISMISSED + 5; i++) mod.dismissUpNext(`b${i}`);
    expect(renderHook(() => mod.useUpNextDismissed('b0')).result.current).toBe(false);
    expect(renderHook(() => mod.useUpNextDismissed(`b${mod.MAX_DISMISSED + 4}`)).result.current).toBe(true);
  });

  it('still works for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mod.dismissUpNext('b1');
    expect(renderHook(() => mod.useUpNextDismissed('b1')).result.current).toBe(true);
  });

  it('ignores storage it cannot read', async () => {
    localStorage.setItem('storyshelf.upNextDismissed', '{not json');
    vi.resetModules();
    const again = await import('./upNextDismissed');
    expect(renderHook(() => again.useUpNextDismissed('b1')).result.current).toBe(false);
  });
});
