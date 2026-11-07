import { useQueries } from '@tanstack/react-query';
import { fmtLeft } from '@joepittsy/ui';
import { seriesBooksQuery } from '../api/authors';
import { useBook } from '../api/items';
import { useProgress } from '../api/libraries';
import { bookInSeries, nextInSeries, type NextInSeries } from '../screens/nextInSeries';

export interface UpNext extends NextInSeries {
  /** "Book 2 of Sherlock Holmes", with "· 51m left" for a book already begun. */
  caption: string;
  /** The same without the series' name, for where the heading names it. */
  shortCaption: string;
}

/**
 * The book to offer after `bookId`: its series' books (the series page's own cached queries) and the listener's
 * progress. Undefined while any of that is on its way (or with no book); null once it is all in, or has failed, and
 * there is nothing to offer, so a caller can tell "not known yet" from "none".
 */
export function useNextInSeries(bookId: string | undefined): UpNext | null | undefined {
  const bookQuery = useBook(bookId ?? '');
  const book = bookQuery.data;
  const places = book?.media.metadata.series ?? [];
  const lists = useQueries({
    queries: places.map((s) => seriesBooksQuery(book?.libraryId, s.id)),
  });
  const progressQuery = useProgress();
  const progress = progressQuery.data;
  if (!bookId) return undefined;
  // A book or progress that can't be had leaves nothing to offer; a series list that can't is a series with no next.
  if (bookQuery.isError || progressQuery.isError) return null;
  if (!book || !progress || lists.some((l) => l.isPending)) return undefined;
  const books = new Map(
    places.map((s, i) => [
      s.id,
      lists[i]?.data?.map((item) => ({ item, sequence: item.media.metadata.series?.sequence ?? null })),
    ])
  );
  const next = nextInSeries({ id: book.id, series: places }, books, progress);
  if (!next) return null;
  const { item, sequence } = next.book;
  const at = progress.get(item.id)?.currentTime ?? 0;
  const duration = item.media.duration ?? 0;
  const left = next.label === 'Resume' && duration > 0 && at > 0 ? ` · ${fmtLeft((duration - at) * 1000)}` : '';
  return {
    ...next,
    caption: bookInSeries(sequence, next.series.name) + left,
    shortCaption: bookInSeries(sequence) + left,
  };
}
