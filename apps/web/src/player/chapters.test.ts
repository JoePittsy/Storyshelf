/**
 * Tests for chapter navigation.
 * Code under test: apps/web/src/player/chapters.ts
 *
 * Requirements covered (IDs appear in the test names):
 *  REQ-18 Previous/next chapter. "Previous" in a chapter's first 3 s goes to the
 *         previous chapter; otherwise it restarts the current one.
 *
 * Design facts (ABS v2.37.2): chapters are `{id, start, end, title}` in seconds of
 * the whole book. ABS does NOT validate chapter edits for gaps or overlaps
 * (LibraryItemController.updateMediaChapters only checks types), so a gap between
 * chapters is possible: t in a gap is in no chapter (index -1).
 */
import { describe, expect, it } from 'vitest';
import { chapterIndexAt, nextChapterTarget, previousChapterTarget, type Chapter } from './chapters';

const ch = (id: number, start: number, end: number): Chapter => ({ id, start, end, title: `Chapter ${id + 1}` });

// Five contiguous chapters: 0-100, 100-400, 400-700, 700-1000, 1000-1300.
const BOOK: Chapter[] = [ch(0, 0, 100), ch(1, 100, 400), ch(2, 400, 700), ch(3, 700, 1000), ch(4, 1000, 1300)];
// Two chapters with a gap between them: 0-100, then 150-300.
const GAPPED: Chapter[] = [ch(0, 0, 100), ch(1, 150, 300)];

describe('REQ-18: chapterIndexAt finds the chapter containing a book time', () => {
  it('REQ-18: the very start of the book is chapter 0', () => {
    expect(chapterIndexAt(BOOK, 0), 'Expected t = 0 to be in the first chapter').toBe(0);
  });

  it('REQ-18: a time inside a chapter gives that chapter', () => {
    expect(chapterIndexAt(BOOK, 550), 'Expected 550 s to be in chapter index 2 (400-700)').toBe(2);
  });

  it('REQ-18: an exact boundary belongs to the chapter that starts there', () => {
    expect(chapterIndexAt(BOOK, 100), 'Expected 100 s to start chapter index 1 (start <= t < end)').toBe(1);
    expect(chapterIndexAt(BOOK, 700), 'Expected 700 s to start chapter index 3').toBe(3);
  });

  it('REQ-18: just before a boundary is still the earlier chapter', () => {
    expect(chapterIndexAt(BOOK, 99.999), 'Expected 99.999 s to still be chapter index 0').toBe(0);
  });

  it('REQ-18: the end of the last chapter returns the last index', () => {
    expect(chapterIndexAt(BOOK, 1300), 'Expected t == end of the last chapter to give the last index').toBe(4);
  });

  it('REQ-18: no chapters gives -1', () => {
    expect(chapterIndexAt([], 50), 'Expected -1 when the book has no chapters').toBe(-1);
  });

  it('REQ-18: a time before the first chapter gives -1', () => {
    expect(chapterIndexAt(BOOK, -1), 'Expected -1 for a negative time').toBe(-1);
    expect(chapterIndexAt([ch(0, 30, 100)], 10), 'Expected -1 before a first chapter that starts at 30 s').toBe(-1);
  });

  it('REQ-18: a time past the end of the last chapter gives -1', () => {
    expect(chapterIndexAt(BOOK, 1400), 'Expected -1 beyond the last chapter end').toBe(-1);
  });

  it('REQ-18: a time in a gap between chapters gives -1', () => {
    expect(chapterIndexAt(GAPPED, 120), 'Expected -1 inside the 100-150 gap').toBe(-1);
    expect(chapterIndexAt(GAPPED, 100), 'Expected -1 at exactly the end of chapter 0 when a gap follows').toBe(-1);
  });

  it('REQ-18: the first time after a gap is the next chapter', () => {
    expect(chapterIndexAt(GAPPED, 150), 'Expected 150 s to start chapter index 1').toBe(1);
  });
});

describe('REQ-18: previousChapterTarget', () => {
  it('REQ-18: 0:02 into Chapter 5 goes to the start of Chapter 4', () => {
    expect(previousChapterTarget(BOOK, 1002), 'Expected 2 s into chapter index 4 to go to chapter index 3 start (700)').toBe(700);
  });

  it('REQ-18: exactly at a chapter start goes to the previous chapter', () => {
    expect(previousChapterTarget(BOOK, 1000), 'Expected 0 s into a chapter to count as the first 3 s').toBe(700);
  });

  it('REQ-18: more than 3 s into a chapter restarts the current chapter', () => {
    expect(previousChapterTarget(BOOK, 1003.5), 'Expected 3.5 s into chapter index 4 to restart it (1000)').toBe(1000);
    expect(previousChapterTarget(BOOK, 1200), 'Expected deep into chapter index 4 to restart it (1000)').toBe(1000);
  });

  it('REQ-18: just under 3 s in still goes to the previous chapter', () => {
    expect(previousChapterTarget(BOOK, 1002.9), 'Expected 2.9 s in to be inside the 3 s window').toBe(700);
  });

  it('REQ-18: a custom threshold widens the window', () => {
    expect(previousChapterTarget(BOOK, 708, 10), 'Expected 8 s into chapter index 3 to go back when threshold is 10').toBe(400);
  });

  it('REQ-18: a custom threshold narrows the window', () => {
    expect(previousChapterTarget(BOOK, 702, 1), 'Expected 2 s into chapter index 3 to restart when threshold is 1').toBe(700);
  });

  it('REQ-18: in the first chapter within the window goes to the start of the book', () => {
    expect(previousChapterTarget(BOOK, 1), 'Expected 1 s into chapter 0 to go to 0').toBe(0);
    expect(previousChapterTarget(BOOK, 0), 'Expected 0 s into chapter 0 to stay at 0').toBe(0);
  });

  it('REQ-18: in the first chapter beyond the window restarts the first chapter', () => {
    expect(previousChapterTarget(BOOK, 60), 'Expected 60 s into chapter 0 to restart at 0').toBe(0);
  });

  it('REQ-18: at the very end of the last chapter restarts the last chapter', () => {
    expect(previousChapterTarget(BOOK, 1300), 'Expected the end of the last chapter to restart it (1000)').toBe(1000);
  });

  it('REQ-18: a book with no chapters goes to 0', () => {
    expect(previousChapterTarget([], 500), 'Expected 0 when there are no chapters').toBe(0);
  });

  it('REQ-18: a single-chapter book goes to 0 both inside and outside the window', () => {
    const one = [ch(0, 0, 900)];
    expect(previousChapterTarget(one, 2), 'Expected 0 within 3 s of the only chapter start').toBe(0);
    expect(previousChapterTarget(one, 400), 'Expected 0 (restart) deep in the only chapter').toBe(0);
  });
});

describe('REQ-18: nextChapterTarget', () => {
  it('REQ-18: in the first chapter goes to the start of the second', () => {
    expect(nextChapterTarget(BOOK, 50), 'Expected the start of chapter index 1 (100)').toBe(100);
  });

  it('REQ-18: in a middle chapter goes to the start of the following one', () => {
    expect(nextChapterTarget(BOOK, 550), 'Expected the start of chapter index 3 (700)').toBe(700);
  });

  it('REQ-18: at an exact boundary the chapter that starts there is current, so next is the one after', () => {
    expect(nextChapterTarget(BOOK, 400), 'Expected 400 s (start of chapter index 2) to go on to 700').toBe(700);
  });

  it('REQ-18: from the start of the book goes to the second chapter', () => {
    expect(nextChapterTarget(BOOK, 0), 'Expected the start of chapter index 1 (100)').toBe(100);
  });

  it('REQ-18: in the last chapter returns null', () => {
    expect(nextChapterTarget(BOOK, 1100), 'Expected null in the last chapter').toBeNull();
  });

  it('REQ-18: at the end of the last chapter returns null', () => {
    expect(nextChapterTarget(BOOK, 1300), 'Expected null at t == end of the last chapter').toBeNull();
  });

  it('REQ-18: a book with no chapters returns null', () => {
    expect(nextChapterTarget([], 10), 'Expected null when there are no chapters').toBeNull();
  });

  it('REQ-18: a single-chapter book returns null', () => {
    expect(nextChapterTarget([ch(0, 0, 900)], 10), 'Expected null in the only chapter').toBeNull();
  });
});
