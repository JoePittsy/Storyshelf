import type { LibraryItem } from '../api/libraries';

interface Sortable {
  sequence?: string | null;
  publishedYear?: string | null;
  title: string;
}

/** The leading number of a sequence: "1.5" is 1.5, "2-3" is 2. NaN when there is none. */
export const sequenceNumber = (s?: string | null): number => parseFloat(s ?? '');

/**
 * Reading order: by leading sequence number, then the plain text ("2" before "2-3"). Books with no sequence
 * go last, by publish year (unknown last) then title.
 */
export function compareBooks(a: Sortable, b: Sortable): number {
  const na = sequenceNumber(a.sequence);
  const nb = sequenceNumber(b.sequence);
  if (!Number.isNaN(na) || !Number.isNaN(nb)) {
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    if (na !== nb) return na - nb;
    const bySeq = (a.sequence ?? '').localeCompare(b.sequence ?? '', undefined, { numeric: true });
    if (bySeq) return bySeq;
  }
  const ya = parseInt(a.publishedYear ?? '', 10);
  const yb = parseInt(b.publishedYear ?? '', 10);
  if (ya !== yb && !(Number.isNaN(ya) && Number.isNaN(yb))) {
    if (Number.isNaN(ya)) return 1;
    if (Number.isNaN(yb)) return -1;
    return ya - yb;
  }
  return a.title.localeCompare(b.title);
}

/** A book and where it sits in a series. */
export interface SeriesBook {
  item: LibraryItem;
  sequence: string | null;
}

export const sortSeriesBooks = (books: SeriesBook[]): SeriesBook[] =>
  [...books].sort((a, b) =>
    compareBooks(
      { sequence: a.sequence, publishedYear: a.item.media.metadata.publishedYear, title: a.item.media.metadata.title },
      { sequence: b.sequence, publishedYear: b.item.media.metadata.publishedYear, title: b.item.media.metadata.title },
    ),
  );

export interface AuthorSeries {
  id: string;
  name: string;
  items: (LibraryItem & { media: { metadata: { series: { sequence: string | null } } } })[];
}

export interface AuthorSection {
  id: string;
  name: string;
  books: SeriesBook[];
}

/** An author's books by series (named order, reading order within), plus the books in no series. A book in two series is in both. */
export function groupAuthorBooks(
  series: AuthorSeries[] = [],
  all: LibraryItem[] = [],
): { sections: AuthorSection[]; other: SeriesBook[] } {
  const inSeries = new Set(series.flatMap((s) => s.items.map((i) => i.id)));
  const sections = series
    .map((s) => ({
      id: s.id,
      name: s.name,
      books: sortSeriesBooks(s.items.map((item) => ({ item, sequence: item.media.metadata.series.sequence ?? null }))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const other = sortSeriesBooks(all.filter((i) => !inSeries.has(i.id)).map((item) => ({ item, sequence: null })));
  return { sections, other };
}

/** The "#N" badge for a sequence; none when there isn't one. */
export const sequenceBadge = (s: string | null): string | undefined => (s ? `#${s}` : undefined);

/** The first book not yet finished, and the label for starting it. */
export function nextBook(
  books: SeriesBook[],
  progress: Map<string, { progress: number; isFinished: boolean }>,
): { book: SeriesBook; label: 'Start' | 'Continue' | 'Start again' } | undefined {
  const first = books[0];
  if (!first) return undefined;
  const open = books.find((b) => !progress.get(b.item.id)?.isFinished);
  const touched = books.some((b) => (progress.get(b.item.id)?.progress ?? 0) > 0);
  if (!open) return { book: first, label: 'Start again' };
  return { book: open, label: touched ? 'Continue' : 'Start' };
}
