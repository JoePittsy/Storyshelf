export interface Chapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

/** Index of the chapter containing t (start <= t < end), -1 if none. At t == end of the last chapter, return the last index. */
export function chapterIndexAt(chapters: Chapter[], t: number): number {
  const i = chapters.findIndex((c) => c.start <= t && t < c.end);
  if (i >= 0) return i;
  const last = chapters[chapters.length - 1];
  return last && t === last.end ? chapters.length - 1 : -1;
}

/** REQ-18: under `threshold` s (default 3) into the current chapter → previous chapter's start, else current chapter start. In chapter 0 → 0. In a gap → last chapter start before t. No chapters → 0. */
export function previousChapterTarget(chapters: Chapter[], t: number, threshold = 3): number {
  const i = chapterIndexAt(chapters, t);
  const cur = chapters[i];
  if (!cur) return chapters.filter((c) => c.start < t).pop()?.start ?? 0;
  return t - cur.start < threshold ? (chapters[i - 1]?.start ?? 0) : cur.start;
}

/** Next chapter's start (in a gap: the next start after t), or null in the last chapter or with no chapters. */
export function nextChapterTarget(chapters: Chapter[], t: number): number | null {
  const i = chapterIndexAt(chapters, t);
  if (i >= 0) return chapters[i + 1]?.start ?? null;
  return chapters.find((c) => c.start > t)?.start ?? null;
}
