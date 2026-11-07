// @vitest-environment jsdom
// When the sleep timer pauses playback, the place the timer began is offered back, once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Chapter } from './chapters';

// Chapter 1 is 0..600, chapter 2 is 600..1800.
const CHAPTERS: Chapter[] = [
  { id: 0, start: 0, end: 600, title: 'One' },
  { id: 1, start: 600, end: 1800, title: 'Two' },
];

let mod: typeof import('./fellAsleep');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  mod = await import('./fellAsleep');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('fellAsleepPlace: where to offer to go back to', () => {
  it('where the timer began, when that is in the chapter it stopped in', () => {
    expect(mod.fellAsleepPlace(700, CHAPTERS, 1500)).toEqual({ target: 700, chapter: null });
  });

  it('the start of the chapter it stopped in, when the timer began in an earlier one', () => {
    expect(mod.fellAsleepPlace(100, CHAPTERS, 1500)).toEqual({ target: 600, chapter: 1 });
  });

  it('where the timer began, with no chapters', () => {
    expect(mod.fellAsleepPlace(100, [], 1500)).toEqual({ target: 100, chapter: null });
  });

  it('nothing when that is barely behind where it stopped (the rewind on resume covers it)', () => {
    expect(mod.fellAsleepPlace(1480, CHAPTERS, 1500)).toBeNull();
    expect(mod.fellAsleepPlace(100, CHAPTERS, 610)).toBeNull(); // the chapter began 10 s before
  });

  it('nothing when the timer began at or after where it stopped', () => {
    expect(mod.fellAsleepPlace(1500, CHAPTERS, 1500)).toBeNull();
    expect(mod.fellAsleepPlace(1600, CHAPTERS, 1500)).toBeNull();
  });
});

const rec = { itemId: 'b1', target: 700, chapter: null, stoppedAt: 1500 };
const offer = (itemId: string | undefined, position: number, status = 'paused') =>
  renderHook(() => mod.useFellAsleep(itemId, position, status)).result.current;

describe('the offer', () => {
  it('shows for that book while it sits paused where the timer stopped it', () => {
    mod.rememberFellAsleep(rec);
    expect(offer('b1', 1500)).toEqual(rec);
    expect(offer('b1', 1501)).toEqual(rec); // the pause lands a moment after the timer
  });

  it('not for another book', () => {
    mod.rememberFellAsleep(rec);
    expect(offer('b2', 1500)).toBeNull();
    expect(offer(undefined, 1500)).toBeNull();
  });

  it('not once the place has moved (a seek here, or another device moved on)', () => {
    mod.rememberFellAsleep(rec);
    expect(offer('b1', 1400)).toBeNull();
  });

  it('not while playing or loading', () => {
    mod.rememberFellAsleep(rec);
    expect(offer('b1', 1500, 'playing')).toBeNull();
    expect(offer('b1', 1500, 'loading')).toBeNull();
  });

  it('goes for good when forgotten (on play, on a seek, or once used)', () => {
    const { result } = renderHook(() => mod.useFellAsleep('b1', 1500, 'paused'));
    act(() => mod.rememberFellAsleep(rec));
    expect(result.current).toEqual(rec);
    act(() => mod.forgetFellAsleep());
    expect(result.current).toBeNull();
  });

  it('survives a reload, so the morning after still has it', async () => {
    mod.rememberFellAsleep(rec);
    vi.resetModules();
    const again = await import('./fellAsleep');
    expect(renderHook(() => again.useFellAsleep('b1', 1500, 'paused')).result.current).toEqual(rec);
  });

  it('ignores storage it cannot read', async () => {
    localStorage.setItem('storyshelf.fellAsleep', '{"itemId": 3}');
    vi.resetModules();
    const again = await import('./fellAsleep');
    expect(renderHook(() => again.useFellAsleep('b1', 1500, 'paused')).result.current).toBeNull();
  });

  it('still works for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mod.rememberFellAsleep(rec);
    expect(offer('b1', 1500)).toEqual(rec);
  });
});
