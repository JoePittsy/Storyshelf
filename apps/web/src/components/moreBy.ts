import type { LibraryItem, Progress, Tile } from '../api/libraries';
import { bookInSeries } from '../screens/nextInSeries';
import { groupAuthorBooks, type AuthorSeries } from '../screens/seriesHelpers';

/**
 * How far into a book "More by" appears, as a share of it: three quarters. By then the listener knows whether they
 * like the author; before it, the page is about this book.
 */
export const MORE_BY_THRESHOLD = 0.75;

/** Most books in each "More by" row. */
export const MORE_BY_CAP = 10;

/** A book on a "More by" row, with its caption line: its place in a series (author row) or its author (narrator row). */
export type MoreByTile = Tile & { sub: string | null };

/** Whether the Book screen offers more by the same people: for a finished book, or one MORE_BY_THRESHOLD through. */
export const wantsMoreBy = (p: { progress: number; isFinished: boolean }): boolean =>
  p.isFinished || p.progress >= MORE_BY_THRESHOLD;

/**
 * The author's books in the order their own page lists them (series by name in reading order, then the rest), each
 * once, captioned with its place in the first series it sits in ("Book 2 of Sherlock Holmes").
 */
export function authorShelfBooks(
  series: AuthorSeries[] | undefined,
  items: LibraryItem[] | undefined
): { item: LibraryItem; sub: string | null }[] {
  const { sections, other } = groupAuthorBooks(series, items);
  const books = [
    ...sections.flatMap((s) => s.books.map((b) => ({ item: b.item, sub: bookInSeries(b.sequence, s.name) }))),
    ...other.map((b) => ({ item: b.item, sub: null })),
  ];
  const seen = new Set<string>();
  return books.filter((b) => !seen.has(b.item.id) && !!seen.add(b.item.id));
}

interface Input {
  /** The book whose page this is. */
  bookId: string;
  /** The author's books, from `authorShelfBooks`. */
  author?: { item: LibraryItem; sub: string | null }[];
  /** The narrator's books, in the library's order. */
  narrator?: LibraryItem[];
  progress: Map<string, Progress>;
  /** Books offered elsewhere on the page: the series the Next in series card is for. */
  exclude?: Iterable<string>;
}

/**
 * "More by <author>" and "Also narrated by <narrator>": the other books by the same people, less the book itself,
 * anything finished and anything in `exclude`, each row capped at MORE_BY_CAP. The narrator row never repeats the
 * author's books (it is for what the author row can't offer), so it is empty when the two would be the same.
 */
export function moreBy({ bookId, author = [], narrator = [], progress, exclude = [] }: Input): {
  author: MoreByTile[];
  narrator: MoreByTile[];
} {
  const out = new Set([bookId, ...exclude]);
  const pick = (books: { item: LibraryItem; sub: string | null }[], seen: Set<string>): MoreByTile[] => {
    const tiles: MoreByTile[] = [];
    for (const { item, sub } of books) {
      if (tiles.length >= MORE_BY_CAP) break;
      const p = progress.get(item.id);
      if (seen.has(item.id) || p?.isFinished) continue;
      seen.add(item.id);
      tiles.push({ item, sub, progress: p?.progress ?? 0, isFinished: false });
    }
    return tiles;
  };
  return {
    author: pick(author, new Set(out)),
    narrator: pick(
      narrator.map((item) => ({ item, sub: item.media.metadata.authorName })),
      new Set([...out, ...author.map((b) => b.item.id)])
    ),
  };
}
