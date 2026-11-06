import { describe, expect, it } from 'vitest';
import type { Bookmark } from '../api/bookmarks';
import { bookmarkChapter, bookmarkSecond, defaultBookmarkTitle, planBookmark } from './bookmarks';

const chapters = [
  { id: 0, start: 0, end: 60, title: 'Opening credits' },
  { id: 1, start: 60, end: 600, title: '' },
  { id: 2, start: 600, end: 1200, title: 'Chapter 2' },
  { id: 3, start: 1300, end: 2000, title: 'Roast Mutton' },
];

const bm = (time: number, title: string, libraryItemId = 'li_1'): Bookmark => ({ libraryItemId, time, title, createdAt: 1 });

describe('bookmarkSecond', () => {
  it('rounds down to a whole second, so a bookmark never lands after the place it marks', () => {
    expect(bookmarkSecond(123.97)).toBe(123);
    expect(bookmarkSecond(60)).toBe(60);
  });
  it('is never negative', () => {
    expect(bookmarkSecond(-0.4)).toBe(0);
  });
});

describe('defaultBookmarkTitle', () => {
  it("is the chapter's title", () => {
    expect(defaultBookmarkTitle(chapters, 1500)).toBe('Roast Mutton');
    expect(defaultBookmarkTitle(chapters, 10)).toBe('Opening credits');
  });
  it('is "Chapter N" when the chapter has no title', () => {
    expect(defaultBookmarkTitle(chapters, 61)).toBe('Chapter 2');
  });
  it('is "Bookmark" for a book without chapters, or a gap between them', () => {
    expect(defaultBookmarkTitle([], 61)).toBe('Bookmark');
    expect(defaultBookmarkTitle(chapters, 1250)).toBe('Bookmark');
  });
});

describe('bookmarkChapter', () => {
  it("names the chapter when the bookmark's title is something else", () => {
    expect(bookmarkChapter(chapters, bm(1500, 'The trolls'))).toBe('Roast Mutton');
  });
  it('gives the place instead when the title already is the chapter title', () => {
    expect(bookmarkChapter(chapters, bm(1500, 'Roast Mutton'))).toBe('Chapter 4');
  });
  it('is "Chapter N" for an untitled chapter', () => {
    expect(bookmarkChapter(chapters, bm(61, 'Here'))).toBe('Chapter 2');
  });
  it('says nothing more when the title is already a plain chapter name', () => {
    expect(bookmarkChapter(chapters, bm(700, 'Chapter 2'))).toBeUndefined();
    expect(bookmarkChapter(chapters, bm(61, 'Chapter 2'))).toBeUndefined();
  });
  it('is undefined without chapters, or in a gap', () => {
    expect(bookmarkChapter([], bm(61, 'Here'))).toBeUndefined();
    expect(bookmarkChapter(chapters, bm(1250, 'Here'))).toBeUndefined();
  });
});

describe('planBookmark', () => {
  it('adds one at the whole second with the default title', () => {
    expect(planBookmark([], 'li_1', 1500.8, chapters)).toEqual({ kind: 'add', time: 1500, title: 'Roast Mutton' });
  });
  it('never duplicates: the same second again finds the existing bookmark', () => {
    const existing = bm(1500, 'Renamed');
    expect(planBookmark([existing], 'li_1', 1500.2, chapters)).toEqual({ kind: 'exists', bookmark: existing });
  });
  it('a bookmark at the same second of another book is no duplicate', () => {
    expect(planBookmark([bm(1500, 'x', 'li_2')], 'li_1', 1500, chapters).kind).toBe('add');
  });
});
