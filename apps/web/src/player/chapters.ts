// STUB: tests-first. Behaviour is specified by chapters.test.ts. Do not edit the tests.
export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

/** Index of the chapter containing t (start <= t < end), -1 if none. At t == end of the last chapter, return the last index. */
export function chapterIndexAt(_chapters: Chapter[], _t: number): number {
  throw new Error('not implemented');
}

/** REQ-18: within `threshold` s (default 3) of the current chapter's start → previous chapter's start, else current chapter start. In chapter 0 → 0. No chapters → 0. */
export function previousChapterTarget(_chapters: Chapter[], _t: number, _threshold?: number): number {
  throw new Error('not implemented');
}

/** Next chapter's start, or null in the last chapter or with no chapters. */
export function nextChapterTarget(_chapters: Chapter[], _t: number): number | null {
  throw new Error('not implemented');
}
