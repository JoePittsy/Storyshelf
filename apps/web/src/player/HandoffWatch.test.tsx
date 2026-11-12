// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { HandoffNotice } from './engine';

let notify: (n: HandoffNotice) => void = () => undefined;
const checkHandoff = vi.fn<(why: string) => Promise<void>>(() => Promise.resolve());
const seek = vi.fn();
const carryOnHere = vi.fn();
vi.mock('./engine', () => ({
  checkHandoff: (why: string) => checkHandoff(why),
  seek: (t: number) => seek(t),
  carryOnHere: () => carryOnHere(),
  onHandoffNotice: (cb: (n: HandoffNotice) => void) => {
    notify = cb;
    return () => undefined;
  },
}));
const jumpTo = vi.fn();
vi.mock('./useUndoableJump', () => ({ usePlayerJump: () => ({ jumpTo }) }));
const showToast = vi.fn();
vi.mock('@joepittsy/ui', () => ({ useToast: () => ({ showToast }) }));

import { CHECK_EVERY_MS, HandoffWatch } from './HandoffWatch';

const iPhone = { name: 'iPhone', sameBrowser: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('HandoffWatch', () => {
  it('checks when the page comes back or gets focus, and every minute while visible', () => {
    render(<HandoffWatch />);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(checkHandoff.mock.calls).toEqual([['wake'], ['wake']]);
    vi.advanceTimersByTime(CHECK_EVERY_MS);
    expect(checkHandoff).toHaveBeenLastCalledWith('tick');
  });

  it("a hidden page doesn't ask", () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      render(<HandoffWatch />);
      vi.advanceTimersByTime(CHECK_EVERY_MS * 3);
      expect(checkHandoff).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    }
  });

  it('a newer place taken on Play: says whose, with an Undo back to the place left', () => {
    render(<HandoffWatch />);
    act(() => notify({ kind: 'adopted', itemId: 'b1', from: 9005, to: 11525, device: iPhone }));
    const [text, kind, opts] = showToast.mock.calls[0];
    expect(text).toBe('Picked up where your iPhone left off, 3:12:05');
    expect(kind).toBe('info');
    expect(opts.action.label).toBe('Undo');
    opts.action.onClick();
    expect(seek).toHaveBeenCalledWith(9005);
  });

  it('another device playing too: says so, carries on, and offers a way there', () => {
    render(<HandoffWatch />);
    act(() => notify({ kind: 'conflict', itemId: 'b1', at: 3720, device: { name: null, sameBrowser: false } }));
    const [text, , opts] = showToast.mock.calls[0];
    expect(text).toBe('Another device was also playing, at 1:02:00. Carrying on here.');
    opts.action.onClick();
    expect(jumpTo).toHaveBeenCalledWith(3720, "the other device's place");
  });

  it('a book finished on another device: says so, that nothing is saved here, and offers to carry on', () => {
    render(<HandoffWatch />);
    act(() => notify({ kind: 'finished', itemId: 'b1', device: iPhone }));
    const [text, kind, opts] = showToast.mock.calls[0];
    expect(text).toBe("Your iPhone finished this book. Your place isn't being saved here.");
    expect(kind).toBe('info');
    expect(opts.durationMs).toBeGreaterThan(12000); // it stays: until it is answered, nothing is saved
    expect(opts.action.label).toBe('Carry on from here');
    opts.action.onClick();
    expect(carryOnHere).toHaveBeenCalledTimes(1);
  });
});
