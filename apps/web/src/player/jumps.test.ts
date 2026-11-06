import { describe, expect, it } from 'vitest';
import type { Chapter } from './chapters';
import { jumpLabel, nextJump, previousJump, undoPoint } from './jumps';

const chapters: Chapter[] = [
  { id: 0, start: 0, end: 100, title: 'One' },
  { id: 1, start: 100, end: 200, title: 'Two' },
  { id: 2, start: 200, end: 300, title: 'Three' },
];

describe('undoPoint', () => {
  it('returns the place being left', () => {
    expect(undoPoint('playing', 150, 200)).toBe(150);
    expect(undoPoint('paused', 150, 0)).toBe(150);
  });
  it('offers nothing when no book is playing', () => {
    expect(undoPoint('idle', 150, 200)).toBeNull();
  });
  it('offers nothing when the move is negligible', () => {
    expect(undoPoint('playing', 100.5, 100)).toBeNull();
    expect(undoPoint('playing', 150, 150)).toBeNull();
  });
});

describe('jumpLabel', () => {
  it('names the chapter by position', () => {
    expect(jumpLabel(chapters, 100)).toBe('Chapter 2');
    expect(jumpLabel(chapters, 0)).toBe('Chapter 1');
  });
  it('has a fallback outside any chapter', () => {
    expect(jumpLabel(chapters, 999)).toBe('that point');
  });
});

describe('previousJump / nextJump', () => {
  it('previous restarts the chapter once past the 3 s threshold, else goes back one', () => {
    expect(previousJump(chapters, 150)).toEqual({ target: 100, label: 'Chapter 2' });
    expect(previousJump(chapters, 101)).toEqual({ target: 0, label: 'Chapter 1' });
  });
  it('previous has no jump without chapters', () => {
    expect(previousJump([], 10)).toBeNull();
  });
  it('next goes to the following chapter, and nowhere from the last', () => {
    expect(nextJump(chapters, 150)).toEqual({ target: 200, label: 'Chapter 3' });
    expect(nextJump(chapters, 250)).toBeNull();
  });
});
