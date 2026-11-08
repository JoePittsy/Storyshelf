/**
 * Tests for the resume decisions.
 * Code under test: apps/web/src/player/resume.ts
 *
 * Design facts: decisions come from the element's `paused`, so a missed pause event can't make a
 * lock-screen play a no-op. The reload retry happens once per resume and re-arms on `playing`.
 */
import { describe, expect, it } from 'vitest';
import { createRetryOnce, decide, freshAfterPause, stalledFor } from './resume';

describe('decide', () => {
  it('play resumes a paused element and ignores a playing one', () => {
    expect(decide('play', true)).toBe('play');
    expect(decide('play', false)).toBe('none');
  });
  it('pause pauses a playing element and ignores a paused one', () => {
    expect(decide('pause', false)).toBe('pause');
    expect(decide('pause', true)).toBe('none');
  });
  it('toggle flips whatever the element is doing', () => {
    expect(decide('toggle', true)).toBe('play');
    expect(decide('toggle', false)).toBe('pause');
  });
});

describe('stalledFor', () => {
  it('is false when nothing was requested', () => {
    expect(stalledFor(null, 99_999)).toBe(false);
  });
  it('is false before 3 s and true from 3 s', () => {
    expect(stalledFor(1000, 3999)).toBe(false);
    expect(stalledFor(1000, 4000)).toBe(true);
  });
  it('honours a custom limit', () => {
    expect(stalledFor(0, 500, 500)).toBe(true);
  });
});

describe('createRetryOnce', () => {
  it('allows one attempt, then refuses', () => {
    const r = createRetryOnce();
    expect(r.attempt()).toBe(true);
    expect(r.attempt()).toBe(false);
    expect(r.attempt()).toBe(false);
  });
  it('allows another after a reset', () => {
    const r = createRetryOnce();
    r.attempt();
    r.reset();
    expect(r.attempt()).toBe(true);
  });
});

describe('freshAfterPause', () => {
  it('is false when the book was not paused by the listener', () => {
    expect(freshAfterPause(null, 99_999_999)).toBe(false);
  });
  it('is false for a short pause and true from 30 s', () => {
    expect(freshAfterPause(1000, 30_999)).toBe(false);
    expect(freshAfterPause(1000, 31_000)).toBe(true);
  });
});
