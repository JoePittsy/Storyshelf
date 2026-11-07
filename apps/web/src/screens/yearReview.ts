import { fmtListened } from './historyHelpers';

// The year in review, worked out from the listening sessions. ABS's own GET /api/me/stats/year/:year (2.37.2) has
// the totals, but only the top three authors, one narrator, one month and a random handful of book ids with no times,
// so the review counts the sessions itself and takes only the finished books from the server. Every date function
// takes an optional IANA time zone, as historyHelpers does; left out, it is the device's own.

/** The fields of a listening session the review reads. */
export interface YearSession {
  libraryItemId: string | null;
  displayTitle: string;
  displayAuthor: string | null;
  /** Seconds heard. Old data can send a string. */
  timeListening: number;
  /** Epoch ms. */
  startedAt: number;
  updatedAt: number;
  mediaMetadata?: {
    title?: string | null;
    authors?: { name?: string | null }[] | null;
    narrators?: (string | null)[] | null;
  } | null;
}

export interface Ranked {
  name: string;
  seconds: number;
}

export interface ReviewBook {
  /** Null for a book ABS no longer has: it is shown, but can't be opened and has no cover. */
  id: string | null;
  title: string;
  author: string | null;
  seconds: number;
}

export interface YearReview {
  year: number;
  seconds: number;
  /** Seconds in each month, January first. */
  months: number[];
  /** Most listened first. */
  books: ReviewBook[];
  authors: Ranked[];
  narrators: Ranked[];
  bookCount: number;
}

const monthOf = (ms: number, tz?: string): { year: number; month: number } => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric' })
      .formatToParts(ms)
      .map((x) => [x.type, x.value])
  );
  return { year: Number(p.year), month: Number(p.month) - 1 };
};
const sameMonth = (a: { year: number; month: number }, b: { year: number; month: number }) =>
  a.year === b.year && a.month === b.month;

/** The first instant (to the second) after `from` that falls in a later month than `from`, searching up to `to`. */
function nextMonthStart(from: number, to: number, tz?: string): number {
  const m = monthOf(from, tz);
  let lo = from;
  let hi = to;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (sameMonth(monthOf(mid, tz), m)) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * The seconds heard in a session, shared between the local months it ran across in proportion to the wall-clock time
 * in each. Almost every session sits in one month; one that runs past midnight on the last of the month (New Year's
 * Eve above all) is split at that midnight.
 */
export function monthShares(startedAt: number, endedAt: number, seconds: number, tz?: string) {
  if (!(seconds > 0)) return [];
  const end = Math.max(startedAt, endedAt);
  const spans: { year: number; month: number; ms: number }[] = [];
  let t = startedAt;
  while (true) {
    const m = monthOf(t, tz);
    if (sameMonth(m, monthOf(end, tz))) {
      spans.push({ ...m, ms: end - t });
      break;
    }
    const next = nextMonthStart(t, end, tz);
    spans.push({ ...m, ms: next - t });
    t = next;
  }
  const total = spans.reduce((a, s) => a + s.ms, 0);
  const [first] = spans;
  if (total <= 0 && first) return [{ year: first.year, month: first.month, seconds }];
  return spans
    .filter((s) => s.ms > 0)
    .map((s) => ({ year: s.year, month: s.month, seconds: (seconds * s.ms) / total }));
}

const named = (s: string | null | undefined): s is string => !!s && !!s.trim();

/** The session's authors: its metadata, or else the display line split on commas. Blank or missing names are left out. */
function authorsOf(s: YearSession): string[] {
  const meta = (s.mediaMetadata?.authors ?? []).map((a) => a.name?.trim()).filter(named);
  if (meta.length) return meta;
  return (s.displayAuthor ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(named);
}

const rank = (m: Map<string, number>): Ranked[] =>
  [...m]
    .map(([name, seconds]) => ({ name, seconds }))
    .filter((x) => x.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));

const add = (m: Map<string, number>, key: string, n: number) => m.set(key, (m.get(key) ?? 0) + n);

/** Everything the review shows for `year`, from the sessions (any years, any order). */
export function yearReview(sessions: YearSession[], year: number, tz?: string): YearReview {
  const months: number[] = Array(12).fill(0);
  const books = new Map<string, ReviewBook>();
  const authors = new Map<string, number>();
  const narrators = new Map<string, number>();
  let seconds = 0;

  for (const s of sessions) {
    const heard = Number(s.timeListening) || 0;
    const inYear = monthShares(s.startedAt, s.updatedAt, heard, tz).filter((x) => x.year === year);
    if (!inYear.length) continue;
    const here = inYear.reduce((a, x) => a + x.seconds, 0);
    for (const x of inYear) months[x.month] = (months[x.month] ?? 0) + x.seconds;
    seconds += here;

    const title = s.mediaMetadata?.title?.trim() || s.displayTitle || 'Untitled';
    const key = s.libraryItemId ?? `title:${title}`;
    const author = authorsOf(s);
    const book = books.get(key) ?? {
      id: s.libraryItemId,
      title,
      author: author.length ? author.join(', ') : null,
      seconds: 0,
    };
    book.seconds += here;
    books.set(key, book);
    for (const a of author) add(authors, a, here);
    for (const n of (s.mediaMetadata?.narrators ?? []).map((x) => x?.trim()).filter(named)) add(narrators, n, here);
  }

  return {
    year,
    seconds,
    months,
    books: [...books.values()].sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title)),
    authors: rank(authors),
    narrators: rank(narrators),
    bookCount: books.size,
  };
}

/** The years to offer: every year with listening, newest first, and always this one. */
export function reviewYears(days: Record<string, number>, currentYear: number): number[] {
  const years = new Set([currentYear]);
  for (const [key, secs] of Object.entries(days)) {
    const m = /^(\d{4})-\d{2}-\d{2}$/.exec(key);
    if (m && secs > 0) years.add(Number(m[1]));
  }
  return [...years].sort((a, b) => b - a);
}

/** The month (0 to 11) with the most listening, or null with none. The earlier month wins a tie. */
export function busiestMonth(months: number[]): number | null {
  let best: number | null = null;
  months.forEach((s, i) => {
    if (s > 0 && (best === null || s > (months[best] ?? 0))) best = i;
  });
  return best;
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, i, 15))
);
const SHORT = MONTHS.map((m) => m.slice(0, 3));
export const monthName = (i: number) => MONTHS[i] ?? '';
export const monthShort = (i: number) => SHORT[i] ?? '';

/**
 * The headline figures. `finished` is the server's count, undefined while it is on its way; it is left out until it
 * comes, and when it is 0, as a zero card standing alone says nothing. "Busiest month" only appears when there was more
 * than one month to pick from.
 */
export function reviewCards(r: YearReview, finished: number | undefined): { label: string; value: string }[] {
  const cards = [
    { label: 'Listened', value: fmtListened(r.seconds) },
    { label: 'Books', value: String(r.bookCount) },
  ];
  if (finished) cards.push({ label: 'Finished', value: String(finished) });
  const busy = busiestMonth(r.months);
  if (busy !== null && r.months.filter((s) => s > 0).length > 1)
    cards.push({ label: 'Busiest month', value: monthName(busy) });
  return cards;
}
