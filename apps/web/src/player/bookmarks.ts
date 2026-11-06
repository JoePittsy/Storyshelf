import { findBookmark, type Bookmark } from '../api/bookmarks';
import { isPlainChapterTitle } from './chapterRow';
import { chapterIndexAt, type Chapter } from './chapters';

/** Bookmarks are kept to the whole second, rounded down so one never lands after the place it marks. */
export const bookmarkSecond = (position: number): number => Math.max(0, Math.floor(position));

/** A chapter's name, or "Chapter N" when it has none. */
const chapterName = (chapters: Chapter[], i: number) => chapters[i]?.title.trim() || `Chapter ${i + 1}`;

/** A new bookmark's title: its chapter's name, or "Bookmark" with no chapter to name it after. */
export function defaultBookmarkTitle(chapters: Chapter[], time: number): string {
  const i = chapterIndexAt(chapters, time);
  return i >= 0 ? chapterName(chapters, i) : 'Bookmark';
}

/**
 * The chapter line under a bookmark's title. A renamed bookmark gets its chapter's name; one still named after its
 * chapter gets the chapter's place instead, so the row never says the same thing twice. Undefined when there is
 * nothing to add (no chapter, or a title that is already "Chapter N").
 */
export function bookmarkChapter(chapters: Chapter[], b: Pick<Bookmark, 'time' | 'title'>): string | undefined {
  const i = chapterIndexAt(chapters, b.time);
  if (i < 0) return undefined;
  const name = chapterName(chapters, i);
  if (name !== b.title.trim()) return name;
  return isPlainChapterTitle(name) ? undefined : `Chapter ${i + 1}`;
}

export type BookmarkPlan = { kind: 'add'; time: number; title: string } | { kind: 'exists'; bookmark: Bookmark };

/** What "bookmark this" does at `position`: add one, or find the one already at that second. */
export function planBookmark(
  list: Bookmark[] | undefined,
  libraryItemId: string,
  position: number,
  chapters: Chapter[]
): BookmarkPlan {
  const time = bookmarkSecond(position);
  const existing = findBookmark(list, libraryItemId, time);
  return existing
    ? { kind: 'exists', bookmark: existing }
    : { kind: 'add', time, title: defaultBookmarkTitle(chapters, time) };
}
