// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'storyshelf.jumpMarks';

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('jumpLog', () => {
  it('keeps marks on the device, with where the jump went, so they survive the app closing', async () => {
    const first = await import('./jumpLog');
    first.recordJump('book', 100, { to: 900 }, 1000);
    first.recordJump('book', 2000, { device: true }, 2000);
    vi.resetModules();
    const again = await import('./jumpLog');
    const { renderHook } = await import('@testing-library/react');
    const marks = renderHook(() => again.useJumpMarks('book')).result.current;
    expect(marks).toEqual([
      { position: 100, at: 1000, to: 900 },
      { position: 2000, at: 2000, device: true },
    ]);
  });

  it('keeps marks for each book, dropping the least recently marked past the cap', async () => {
    const log = await import('./jumpLog');
    for (let i = 0; i <= log.MAX_BOOKS; i++) log.recordJump(`b${i}`, 100, {}, i);
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(stored)).toHaveLength(log.MAX_BOOKS);
    expect(stored.b0).toBeUndefined();
    expect(stored[`b${log.MAX_BOOKS}`]).toBeDefined();
  });

  it('forgets everything on sign-out', async () => {
    const log = await import('./jumpLog');
    log.recordJump('book', 100, {}, 1);
    log.clearJumpLog();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores storage it cannot read', async () => {
    localStorage.setItem(KEY, '{not json');
    const log = await import('./jumpLog');
    const { renderHook } = await import('@testing-library/react');
    expect(renderHook(() => log.useJumpMarks('book')).result.current).toEqual([]);
  });
});
