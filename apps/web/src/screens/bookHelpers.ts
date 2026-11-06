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

const BARE_URL = /https?:\/\/[^\s<>"']+/gi;

/** A URL ends before trailing sentence punctuation, and before a closing bracket that has no opener in the URL. */
function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.slice(-1);
    const closer = ')]}'.indexOf(last);
    const unbalanced = closer >= 0 && url.split(last).length > url.split('([{'[closer]).length;
    if (/[.,;:!?'"]/.test(last) || unbalanced) url = url.slice(0, -1);
    else return url;
  }
}

/** Wraps bare http(s) URLs in text nodes in links. Never touches text already inside an anchor. */
function linkify(root: DocumentFragment): void {
  const doc = document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const node of texts) {
    const text = node.data;
    const frag = doc.createDocumentFragment();
    let at = 0;
    for (const m of text.matchAll(BARE_URL)) {
      const url = trimUrl(m[0]);
      let href: string;
      try {
        const u = new URL(url);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        href = u.href;
      } catch {
        continue;
      }
      frag.append(text.slice(at, m.index));
      const a = doc.createElement('a');
      a.href = href;
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      a.textContent = url;
      frag.append(a);
      at = m.index + url.length;
    }
    if (at === 0) continue;
    frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}

/**
 * ABS descriptions can carry HTML from the metadata provider: strip scripts and handlers, then turn bare http(s) URLs
 * in the text into links that open in a new tab. Linking runs after sanitising and only builds anchors it made itself
 * from http(s) URLs, so it can't introduce anything the sanitiser removed.
 */
export function sanitiseDescription(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = DOMPurify.sanitize(html);
  linkify(tpl.content);
  return tpl.innerHTML;
}

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

/** What the player knows about itself that the book page needs. */
export interface LiveSource {
  item: { id: string } | null;
  position: number;
  duration: number;
  chapterIndex: number;
}

export interface BookProgress {
  /** Book seconds. */
  currentTime: number;
  /** 0..1 */
  progress: number;
  isFinished: boolean;
  chapterIndex: number;
  /** True when these come from the player rather than the last fetch. */
  live: boolean;
}

/**
 * Where the listener is in a book. For the book loaded in the player, the player's own position, chapter and
 * progress (the fetched ones only change on refetch); for any other, what the server last said.
 */
export function bookProgress(item: BookItem, player: LiveSource): BookProgress {
  const p = item.userMediaProgress;
  if (player.item?.id === item.id && player.duration > 0) {
    const finished = player.position >= player.duration - 1;
    return {
      currentTime: player.position,
      progress: Math.min(1, Math.max(0, player.position / player.duration)),
      isFinished: finished,
      chapterIndex: player.chapterIndex,
      live: true,
    };
  }
  return {
    currentTime: p?.currentTime ?? 0,
    progress: p?.progress ?? 0,
    isFinished: !!p?.isFinished,
    chapterIndex: p ? currentChapterIndex(item.media.chapters, p.currentTime) : -1,
    live: false,
  };
}

/**
 * When a description is nothing but a link (a common metadata-provider habit), the link and a short name for it,
 * "archive.org" rather than the address. Null for real prose, or a URL with words around it.
 */
export function descriptionSource(html: string): { href: string; host: string } | null {
  const tpl = document.createElement('template');
  tpl.innerHTML = DOMPurify.sanitize(html);
  const text = (tpl.content.textContent ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(text)) return null;
  try {
    const u = new URL(text);
    return { href: u.href, host: u.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}
