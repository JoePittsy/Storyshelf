import { describe, it, expect } from 'vitest';
import { chapterRowText, isPlainChapterTitle } from './chapterRow';

describe('isPlainChapterTitle', () => {
  it('matches only a bare "Chapter N"', () => {
    expect(isPlainChapterTitle('Chapter 6')).toBe(true);
    expect(isPlainChapterTitle('  chapter 12 ')).toBe(true);
    expect(isPlainChapterTitle('Chapter 6: The Circus')).toBe(false);
    expect(isPlainChapterTitle('Opening credits')).toBe(false);
    expect(isPlainChapterTitle('The Tale of Peter Rabbit')).toBe(false);
  });
});

describe('chapterRowText', () => {
  it('prints no "M of T" when the title is just "Chapter N", and says the place in the accessible name', () => {
    // "Opening credits" counts as place 1, so "Chapter 6" sits at index 6 (place 7 of 28).
    const r = chapterRowText('Chapter 6', 6, 28);
    expect(r.title).toBe('Chapter 6');
    expect(r.count).toBeNull();
    expect(r.hint).toBe(', track 7 of 28. Opens the chapter list');
  });

  it('shows "M of T" beside a named chapter', () => {
    const r = chapterRowText('The Tale of Squirrel Nutkin', 3, 18);
    expect(r.title).toBe('The Tale of Squirrel Nutkin');
    expect(r.count).toBe('4 of 18');
    expect(r.hint).toBe('. Opens the chapter list');
  });

  it('names an untitled chapter by its place and prints no count', () => {
    const r = chapterRowText('  ', 0, 5);
    expect(r.title).toBe('Chapter 1');
    expect(r.count).toBeNull();
  });
});
