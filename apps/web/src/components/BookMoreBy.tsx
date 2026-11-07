import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Carousel, ImageTile, ProgressBar, SectionCard } from '@joepittsy/ui';
import { authorQuery, seriesBooksQuery } from '../api/authors';
import type { BookItem } from '../api/items';
import { absFilter, coverUrl, DEFAULT_SORT, useLibraryItems, useProgress } from '../api/libraries';
import { authorShelfBooks, moreBy, wantsMoreBy, type MoreByTile } from './moreBy';
import { useNextInSeries } from './useNextInSeries';
import styles from './BookMoreBy.module.css';

interface Props {
  book: BookItem;
  /** Where the listener is in it now (the player's live position when it has the book). */
  progress: number;
  isFinished: boolean;
}

/** One card of small covers, each linking to its book. The hero already links the person, so the card doesn't. */
function Row({ title, tiles }: { title: string; tiles: MoreByTile[] }) {
  const navigate = useNavigate();
  return (
    <SectionCard title={title} className={styles.card}>
      <Carousel gap="0.9em" className={styles.row}>
        {tiles.map(({ item, progress, sub }) => (
          <div key={item.id} className={styles.tile}>
            <ImageTile
              size="sm"
              title={item.media.metadata.title}
              sub={sub}
              imageUrl={coverUrl(item)}
              artFit="contain"
              href={`/book/${item.id}`}
              onOpen={() => void navigate(`/book/${item.id}`)}
              overlay={
                <ProgressBar
                  variant="overlay"
                  value={progress}
                  label={`Progress through ${item.media.metadata.title}`}
                />
              }
            />
          </div>
        ))}
      </Carousel>
    </SectionCard>
  );
}

/**
 * The Book screen's quiet way on, once a book is finished or MORE_BY_THRESHOLD through: other books by its (first)
 * author, then by its (first) narrator when that adds anyone else's. Only the listener's own library, never their
 * finished books, and never the series the Next in series card is already offering. Nothing at all until every list it
 * needs has arrived, so a row never appears and then shrinks.
 */
export function BookMoreBy({ book, progress, isFinished }: Props) {
  const show = wantsMoreBy({ progress, isFinished });
  const { metadata: m } = book.media;
  const author = m.authors[0];
  const narrator = m.narrators[0];
  const libraryId = book.libraryId;

  const authorBooks = useQuery({ ...authorQuery(author?.id ?? ''), enabled: show && !!author });
  const narratorBooks = useLibraryItems(
    show && narrator ? libraryId : undefined,
    DEFAULT_SORT,
    narrator ? absFilter('narrators', narrator) : undefined
  );
  // The Next in series card's own queries (shared), so its series can be left out here once it is known.
  const next = useNextInSeries(isFinished ? book.id : undefined);
  const series = useQueries({
    queries: m.series.map((s) => ({
      ...seriesBooksQuery(libraryId, s.id),
      enabled: show && isFinished && !!libraryId,
    })),
  });
  const listening = useProgress();

  const settled =
    show &&
    !!listening.data &&
    (!author || !authorBooks.isPending) &&
    (!narrator || !libraryId || !narratorBooks.isPending) &&
    (!isFinished || !libraryId || series.every((q) => !q.isPending));
  const nextSeries = next ? series[m.series.findIndex((s) => s.id === next.series.id)]?.data : undefined;

  const rows = useMemo(
    () =>
      settled
        ? moreBy({
            bookId: book.id,
            author: authorShelfBooks(authorBooks.data?.series, authorBooks.data?.libraryItems),
            narrator: narratorBooks.data?.pages[0]?.results,
            progress: listening.data ?? new Map(),
            exclude: nextSeries?.map((b) => b.id),
          })
        : undefined,
    [settled, book.id, authorBooks.data, narratorBooks.data, listening.data, nextSeries]
  );
  if (!rows || (rows.author.length === 0 && rows.narrator.length === 0)) return null;

  return (
    // A fragment: each card is one of the page column's own sections, spaced as they are.
    <>
      {author && rows.author.length > 0 && <Row title={`More by ${author.name}`} tiles={rows.author} />}
      {narrator && rows.narrator.length > 0 && <Row title={`Also narrated by ${narrator}`} tiles={rows.narrator} />}
    </>
  );
}
