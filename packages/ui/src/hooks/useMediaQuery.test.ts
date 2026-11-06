import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

afterEach(() => vi.unstubAllGlobals());

describe('useMediaQuery', () => {
  it('is false where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useMediaQuery('(min-width: 60em)')).result.current).toBe(false);
  });

  it('reads the query and follows changes', () => {
    let matches = false;
    let notify = () => {};
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, cb: () => void) => (notify = cb),
      removeEventListener: () => {},
    }));
    const { result } = renderHook(() => useMediaQuery('(min-width: 60em)'));
    expect(result.current).toBe(false);
    matches = true;
    act(() => notify());
    expect(result.current).toBe(true);
  });
});
