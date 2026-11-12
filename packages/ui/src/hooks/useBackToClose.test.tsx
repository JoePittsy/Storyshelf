import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { freshHistory, routerHears, settle } from '../test/history';
import { useBackToClose } from './useBackToClose';

describe('useBackToClose', () => {
  beforeEach(freshHistory);

  it('holds an entry only while open, and Back calls the latest onClose', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const n = history.length;
    const { rerender } = renderHook(({ open, cb }) => useBackToClose(open, cb), {
      initialProps: { open: false, cb: first },
    });
    await settle();
    expect(history.length).toBe(n);
    rerender({ open: true, cb: first });
    await settle();
    expect(history.length).toBe(n + 1);
    rerender({ open: true, cb: second });
    history.back();
    await settle();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('open flipping to false removes the entry again', async () => {
    const router = routerHears();
    const { rerender } = renderHook(({ open }) => useBackToClose(open, vi.fn()), { initialProps: { open: true } });
    await settle();
    rerender({ open: false });
    await settle();
    history.back();
    await settle();
    expect(location.pathname).toBe('/a');
    expect(router.heard).toEqual(['/a']);
    router.stop();
  });
});
