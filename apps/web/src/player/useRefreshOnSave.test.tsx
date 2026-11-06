// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

let saved: (() => void) | undefined;
vi.mock('./engine', () => ({
  onProgressSaved: (cb: () => void) => {
    saved = cb;
    return () => {
      saved = undefined;
    };
  },
}));

import { PROGRESS_KEYS, useRefreshOnSave } from './useRefreshOnSave';

describe('useRefreshOnSave', () => {
  it('invalidates the book, progress and listening queries when the player reports a save, and only then', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => useRefreshOnSave(), { wrapper });
    expect(spy).not.toHaveBeenCalled();
    saved?.();
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual(PROGRESS_KEYS.map((k) => [...k]));
    expect(keys).toEqual(expect.arrayContaining([['item'], ['me'], ['listening-sessions'], ['item-sessions']]));
    unmount();
    expect(saved).toBeUndefined();
  });
});
