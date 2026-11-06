import DOMPurify from 'dompurify';
import type { BookItem, Chapter } from '../api/items';

/** "4h 12m", or "12m" under an hour. Whole minutes, rounded down. */
export function fmtLong(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

/** "h:mm:ss" (chapter start times), or "m:ss" under an hour for durations. */
export function fmtClock(seconds: number, alwaysHours = true): string {
  const s = Math.floor(Math.max(0, seconds));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h || alwaysHours ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Index of the chapter containing `t` (start <= t < end), or -1 before the first start or after the end. */
export function currentChapterIndex(chapters: Chapter[], t: number): number {
  return chapters.findIndex((c) => t >= c.start && t < c.end);
}

interface Progress {
  currentTime: number;
  isFinished: boolean;
}

export function playLabel(p?: Progress | null): 'Play' | 'Resume' | 'Play again' {
  if (p?.isFinished) return 'Play again';
  return p && p.currentTime > 0 ? 'Resume' : 'Play';
}

/** Where playback starts for the primary button. */
export const playFrom = (p?: Progress | null): number => (playLabel(p) === 'Resume' ? p!.currentTime : 0);

/** ABS descriptions can carry HTML from the metadata provider; strip scripts and handlers. */
export const sanitiseDescription = (html: string): string => DOMPurify.sanitize(html);

/** "656.4 MB": decimal units, as ABS shows them. */
export function fmtSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = Math.max(0, bytes);
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

/** "A, B, C and 4 more" when over `max`; the whole list otherwise. */
export function summariseList(names: string[], max: number): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** The details ABS shows for a book, only the ones it has. */
export function bookDetails(item: BookItem): { label: string; value: string }[] {
  const { metadata: m, duration } = item.media;
  const series = m.series.map((s) => (s.sequence ? `${s.name} #${s.sequence}` : s.name)).join(', ');
  const rows: [string, string | undefined | null][] = [
    ['Narrators', m.narrators.join(', ')],
    ['Series', series],
    ['Published', m.publishedYear],
    ['Publisher', m.publisher],
    ['Genres', m.genres?.join(', ')],
    ['Language', m.language],
    ['Duration', duration > 0 ? fmtLong(duration) : null],
    ['Size', item.size ? fmtSize(item.size) : null],
    ['ISBN', m.isbn],
    ['ASIN', m.asin],
  ];
  return rows.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}
