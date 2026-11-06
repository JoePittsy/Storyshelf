/**
 * Tests for the progress bar modes. Code under test: apps/web/src/player/progressWindow.ts
 *
 *  REQ-46 Book: the whole book, chapter ticks, seekable.
 *  REQ-47 Chapter: the current chapter, no ticks; no chapters behaves like Book.
 *  REQ-48 Sleep: from where the timer was set to where playback will stop; not seekable; falls back when inactive.
 */
import { describe, expect, it } from 'vitest';
import type { Chapter } from './chapters';
import { progressWindow, resolveMode, sleepStopAt, type WindowInput } from './progressWindow';

// Chapters 0-100, 100-250, then a gap, 300-400. The book is 420 s.
const CHAPTERS: Chapter[] = [
  { id: 0, start: 0, end: 100, title: 'One' },
  { id: 1, start: 100, end: 250, title: 'Two' },
  { id: 2, start: 300, end: 400, title: 'Three' },
];
const base: WindowInput = { position: 0, duration: 420, chapters: CHAPTERS, sleep: null, sleepFrom: 0, rate: 1 };
const at = (position: number, extra: Partial<WindowInput> = {}) => ({ ...base, position, ...extra });

describe('REQ-46: Book mode', () => {
  it('spans the whole book, seekable, with a tick per chapter (ms)', () => {
    const w = progressWindow('book', at(120));
    expect([w.start, w.end, w.seekable]).toEqual([0, 420, true]);
    expect(w.markers.map((m) => m.at)).toEqual([0, 100000, 300000]);
    expect(w.label).toBeUndefined();
  });
  it('is not seekable while the duration is unknown', () => {
    expect(progressWindow('book', at(0, { duration: 0 })).seekable).toBe(false);
  });
});

describe('REQ-47: Chapter mode', () => {
  it('spans the chapter holding the position, with no ticks', () => {
    const w = progressWindow('chapter', at(120));
    expect([w.start, w.end, w.seekable, w.markers]).toEqual([100, 250, true, []]);
  });
  it('takes the later chapter exactly on a boundary, so the bar resets on crossing', () => {
    expect(progressWindow('chapter', at(99.9)).end).toBe(100);
    const w = progressWindow('chapter', at(100));
    expect([w.start, w.end]).toEqual([100, 250]);
  });
  it('spans the gap between two chapters while in it', () => {
    const w = progressWindow('chapter', at(270));
    expect([w.start, w.end]).toEqual([250, 300]);
  });
  it('spans from the last chapter to the end of the book past it', () => {
    expect([progressWindow('chapter', at(410)).start, progressWindow('chapter', at(410)).end]).toEqual([400, 420]);
  });
  it('holds the last chapter at its exact end', () => {
    const w = progressWindow('chapter', at(400));
    expect([w.start, w.end]).toEqual([300, 400]);
  });
  it('clamps a chapter running past the duration', () => {
    const w = progressWindow('chapter', at(350, { duration: 380 }));
    expect([w.start, w.end]).toEqual([300, 380]);
  });
  it('behaves like Book with no chapters', () => {
    const w = progressWindow('chapter', at(50, { chapters: [] }));
    expect([w.start, w.end, w.seekable]).toEqual([0, 420, true]);
  });
});

describe('REQ-48: Sleep mode', () => {
  const minutes = (remainingMs: number) => ({ kind: 'minutes' as const, remainingMs });

  it('for a minutes timer runs from where it was set to position + remaining', () => {
    const w = progressWindow('sleep', at(60, { sleep: minutes(120_000), sleepFrom: 20 }));
    expect([w.start, w.end, w.seekable, w.markers]).toEqual([20, 180, false, []]);
    expect(w.label).toBe('Stops in 2:00');
  });
  it('recomputes the stop point as the rate changes', () => {
    const slow = progressWindow('sleep', at(60, { sleep: minutes(120_000), rate: 1 }));
    const fast = progressWindow('sleep', at(60, { sleep: minutes(120_000), rate: 2 }));
    expect(slow.end).toBe(180);
    expect(fast.end).toBe(300);
    expect(fast.label).toBe('Stops in 2:00');
  });
  it('clamps the stop point to the end of the book', () => {
    expect(progressWindow('sleep', at(60, { sleep: minutes(3_600_000) })).end).toBe(420);
  });
  it('for end of chapter runs to the timer endsAt, labelled in real time', () => {
    const sleep = { kind: 'chapter' as const, endsAt: 250 };
    const w = progressWindow('sleep', at(130, { sleep, sleepFrom: 110, rate: 2 }));
    expect([w.start, w.end, w.seekable]).toEqual([110, 250, false]);
    expect(w.label).toBe('Stops in 1:00');
  });
  it('starts at the position if it moved before where the timer was set', () => {
    expect(progressWindow('sleep', at(30, { sleep: minutes(60_000), sleepFrom: 90 })).start).toBe(30);
  });
  it('rounds the countdown up and shows hours', () => {
    expect(progressWindow('sleep', at(0, { sleep: minutes(750_400) })).label).toBe('Stops in 12:31');
    expect(progressWindow('sleep', at(0, { sleep: minutes(3_600_000) })).label).toBe('Stops in 1:00:00');
  });
  it('with an expired or cancelled timer is the Book window', () => {
    const w = progressWindow('sleep', at(60));
    expect([w.start, w.end, w.seekable]).toEqual([0, 420, true]);
  });
  it('sleepStopAt is null with no timer', () => {
    expect(sleepStopAt(null, 10, 1)).toBeNull();
  });
});

describe('REQ-45: resolveMode', () => {
  it('keeps Book and Chapter whatever the timer', () => {
    expect(resolveMode('book', 'book', false)).toBe('book');
    expect(resolveMode('chapter', 'book', true)).toBe('chapter');
  });
  it('keeps Sleep while a timer is active', () => {
    expect(resolveMode('sleep', 'chapter', true)).toBe('sleep');
  });
  it('falls back to the previously chosen mode when the timer ends', () => {
    expect(resolveMode('sleep', 'chapter', false)).toBe('chapter');
    expect(resolveMode('sleep', 'sleep', false)).toBe('book');
  });
});
