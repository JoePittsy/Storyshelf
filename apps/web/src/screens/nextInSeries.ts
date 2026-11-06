import type { Progress } from '../api/libraries';
import { sortSeriesBooks, type SeriesBook } from './seriesHelpers';

/** A book's place in one of its series, as ABS lists it (`media.metadata.series[]`). */
export interface SeriesPlace {
  id: string;
  name: string;
  sequence: string | null;
}

/** The book to offer once the current one is done: which series it continues, the book, and whether it starts or carries on. */
export interface NextInSeries {
  series: { id: string; name: string };
  book: SeriesBook;
  label: 'Start' | 'Continue';
}

type Listening = Map<string, Pick<Progress, 'progress' | 'isFinished'>>;

/**
 * Where a sequence sits: "3" is 3 to 3, "1.5" is 1.5, "2-3" (an omnibus) is 2 to 3. Undefined when it has no leading
 * number ("Prequel", "Book one", missing): such a book has no place to count from.
 */
export function seriesSpan(sequence: string | null | undefined): { start: number; end: number } | undefined {
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/.exec(sequence ?? '');
  if (!m) return undefined;
  const start = parseFloat(m[1]);
  const end = m[2] === undefined ? start : Math.max(start, parseFloat(m[2]));
  return { start, end };
}

const begun = (p: Listening, id: string) => {
  const x = p.get(id);
  return !!x && (x.isFinished || x.progress > 0);
};

/**
 * The next book in one series after a book at `place`: the first place after this book's last part that isn't done,
 * skipping finished books. Books with no numeric sequence are never offered (nothing says they come after). Books
 * sharing a place (two editions, a duplicate) are one place: done when any of them is finished, and the one already
 * begun is offered over the rest.
 */
function nextAfter(
  currentId: string,
  place: { start: number; end: number },
  books: SeriesBook[],
  progress: Listening,
): SeriesBook | undefined {
  const later = sortSeriesBooks(books).filter((b) => {
    const s = seriesSpan(b.sequence);
    return b.item.id !== currentId && !!s && s.start > place.end;
  });
  const places = new Map<number, SeriesBook[]>();
  for (const b of later) {
    const start = seriesSpan(b.sequence)?.start ?? NaN;
    places.set(start, [...(places.get(start) ?? []), b]);
  }
  for (const group of places.values()) {
    if (group.some((b) => progress.get(b.item.id)?.isFinished)) continue;
    return group.find((b) => begun(progress, b.item.id)) ?? group[0];
  }
  return undefined;
}

/**
 * How closely the listener is following this series up to here: the share of its books before this one that they
 * have begun or finished. 0 when nothing comes before.
 */
function followed(currentStart: number, books: SeriesBook[], progress: Listening): number {
  const before = books.filter((b) => (seriesSpan(b.sequence)?.start ?? Infinity) < currentStart);
  return before.length === 0 ? 0 : before.filter((b) => begun(progress, b.item.id)).length / before.length;
}

/**
 * The book to offer after `current`, or undefined when there is none (the last book, everything after it finished,
 * the book has no numeric place, or the series books haven't loaded).
 *
 * A book in several series (Mort is Discworld #4 and Death #1) is offered the next book of the series the listener is
 * evidently following: the one where they have heard the largest share of the books before this one. With nothing to
 * tell them apart (a first listen, or every series heard in order) it takes the series ABS lists first, which is the
 * order they were entered in and usually puts the main series first. A series with nothing left to offer is passed
 * over for the next one that has something.
 *
 * `books` is each series' books by series id; a series still loading is simply absent.
 */
export function nextInSeries(
  current: { id: string; series: SeriesPlace[] },
  books: Map<string, SeriesBook[] | undefined>,
  progress: Listening,
): NextInSeries | undefined {
  const ranked = current.series
    .map((s, order) => {
      const place = seriesSpan(s.sequence);
      const list = books.get(s.id);
      return place && list ? { s, order, place, list, share: followed(place.start, list, progress) } : undefined;
    })
    .filter((c) => !!c)
    .sort((a, b) => b.share - a.share || a.order - b.order);
  for (const c of ranked) {
    const book = nextAfter(current.id, c.place, c.list, progress);
    if (!book) continue;
    const p = progress.get(book.item.id);
    return {
      series: { id: c.s.id, name: c.s.name },
      book,
      label: p && p.progress > 0 && !p.isFinished ? 'Continue' : 'Start',
    };
  }
  return undefined;
}

/** "Book 2 of Sherlock Holmes", "Books 2-3 of …"; just "Book 2" when the series is named already. */
export function bookInSeries(sequence: string | null, seriesName?: string): string {
  const s = sequence ?? '';
  const span = seriesSpan(s);
  const head = `${span && span.end > span.start ? 'Books' : 'Book'} ${s}`.trim();
  return seriesName ? `${head} of ${seriesName}` : head;
}
