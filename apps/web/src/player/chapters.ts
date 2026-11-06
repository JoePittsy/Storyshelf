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

/** Seek-bar markers for a book's chapters, shared by the full and mini players so their ticks and previews match. */
export const chapterMarkers = (chapters: Chapter[]): { at: number; label: string }[] =>
  chapters.map((c, i) => ({ at: c.start * 1000, label: `Chapter ${i + 1}: ${c.title}` }));

/**
 * A chapter's name without a leading "04 - " or "4. " when that number is just its place in the list: the list already
 * shows the number, so the name would be read out twice. A different number is part of the name and stays.
 */
export function chapterTitle(title: string, index: number): string {
  const m = /^\s*0*(\d+)\s*(?:[-–—.:)]\s+|[-–—]\s*)(.+)$/.exec(title);
  if (m && Number(m[1]) === index + 1 && m[2]!.trim()) return m[2]!.trim();
  return title;
}

/** Applied once where ABS chapters become UI data (the playback session, the book), so every surface shows clean names. */
export function cleanChapters<T extends { title: string }>(chapters: T[] | undefined): T[] {
  return (chapters ?? []).map((c, i) => ({ ...c, title: chapterTitle(c.title, i) }));
}
