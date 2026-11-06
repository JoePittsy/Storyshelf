import { describe, expect, it } from 'vitest';
import { modeFlash, nextMode } from './modeTap';

const on = { sleepActive: true, hasChapters: true };

describe('nextMode', () => {
  it('goes Book, Chapter, Sleep, Book while a timer is set', () => {
    expect(nextMode('book', on)).toBe('chapter');
    expect(nextMode('chapter', on)).toBe('sleep');
    expect(nextMode('sleep', on)).toBe('book');
  });
  it('skips Sleep when no timer is set', () => {
    const o = { ...on, sleepActive: false };
    expect(nextMode('book', o)).toBe('chapter');
    expect(nextMode('chapter', o)).toBe('book');
  });
  it('falls back to Book when the timer has ended under Sleep', () => {
    expect(nextMode('sleep', { ...on, sleepActive: false })).toBe('book');
  });
  it('skips Chapter in a book with no chapters', () => {
    const o = { sleepActive: true, hasChapters: false };
    expect(nextMode('book', o)).toBe('sleep');
    expect(nextMode('sleep', o)).toBe('book');
    expect(nextMode('book', { sleepActive: false, hasChapters: false })).toBe('book');
  });
});

describe('modeFlash', () => {
  it('names each mode', () => {
    expect(modeFlash('book')).toBe('Whole book');
    expect(modeFlash('chapter')).toBe('This chapter');
    expect(modeFlash('sleep', 'Stops in 12:30')).toBe('Until sleep · 12:30');
    expect(modeFlash('sleep')).toBe('Until sleep');
  });
});
