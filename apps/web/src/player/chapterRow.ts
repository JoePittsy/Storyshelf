/** A title that is only "Chapter 6": it already says which chapter, so it needs no "7 of 28" beside it. */
export const isPlainChapterTitle = (title: string): boolean => /^\s*chapter\s+\d+\s*$/i.test(title);

export interface ChapterRowText {
  /** What the row shows. */
  title: string;
  /** "7 of 28" beside the title, or null when the title is just "Chapter N" (the two numbers would disagree whenever the first track is not a chapter). */
  count: string | null;
  /** Unseen text after the title and count in the button's name: what it does, and the place when no count is shown. */
  hint: string;
}

/**
 * The single chapter row's words. `index` is the chapter's place in the list (from 0). Books count front matter
 * ("Opening credits") as a chapter, so the title "Chapter 6" can sit at place 7: when the title is just "Chapter N" the
 * row shows it alone, and the place is spoken in the accessible name instead.
 */
export function chapterRowText(rawTitle: string, index: number, total: number): ChapterRowText {
  const place = `${index + 1} of ${total}`;
  const title = rawTitle.trim() || `Chapter ${index + 1}`;
  if (!rawTitle.trim() || isPlainChapterTitle(title))
    return { title, count: null, hint: `, track ${place}. Opens the chapter list` };
  return { title, count: place, hint: '. Opens the chapter list' };
}
