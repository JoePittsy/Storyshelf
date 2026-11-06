import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Artwork, ExpandableText, HeroBand, PeopleLinks, PillButton } from '@joepittsy/ui';
import { useAuthorIds, useSeries, useSeriesBooks } from '../api/authors';
import { coverUrl, mergeProgress, useProgress } from '../api/libraries';
import { BackLink } from '../components/BackLink';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import { LoadFailed } from '../components/LoadFailed';
import { sanitiseDescription } from './bookHelpers';
import { nextBook, sequenceBadge, sortSeriesBooks } from './seriesHelpers';
import styles from './Collection.module.css';

/** A series: name, authors, then its books in reading order with sequence badges and progress (REQ-30). */
export function Series() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const series = useSeries(id);
  const libraryId = series.data?.libraryId;
  const items = useSeriesBooks(libraryId, id);
  const progress = useProgress();
  const authorIds = useAuthorIds(libraryId);

  const books = useMemo(
    () => sortSeriesBooks((items.data ?? []).map((item) => ({ item, sequence: item.media.metadata.series?.sequence ?? null }))),
    [items.data],
  );
  const tiles = useMemo(
    () =>
      mergeProgress(
        books.map((b) => b.item),
        progress.data ?? new Map(),
      ).map((t, i) => ({ item: t.item, progress: t.progress, badge: sequenceBadge(books[i]?.sequence ?? null) })),
    [books, progress.data],
  );
  const description = useMemo(
    () => (series.data?.description ? sanitiseDescription(series.data.description) : ''),
    [series.data],
  );

  const failed = series.isError ? series : items.isError ? items : null;
  if (!series.data || failed)
    return (
      <main className={styles.page}>
        <BackLink />
        {failed ? (
          <div className={styles.state}>
            <LoadFailed error={failed.error} noun="series" onRetry={() => void failed.refetch()} />
          </div>
        ) : (
          <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />
        )}
      </main>
    );

  const names = [...new Set(books.flatMap((b) => b.item.media.metadata.authorName?.split(/,\s*/) ?? []))];
  const ids = authorIds.data;
  // Link only when every name resolves to an author; a half-linked credit reads as broken.
  const linkable = !!ids && names.length > 0 && names.every((n) => ids.has(n));
  const next = nextBook(books, progress.data ?? new Map());
  const first = books[0];
  const count = books.length;

  return (
    <main className={styles.page}>
      <BackLink />
      <HeroBand
        kind="Series"
        title={series.data.name}
        art={<Artwork src={first ? coverUrl(first.item) : null} placeholderClassName={styles.ph} lazy={false} />}
      >
        {names.length > 0 && (
          <p className={styles.line}>
            {linkable ? (
              <PeopleLinks
                people={names.join(', ')}
                onOpenPerson={(name) => void navigate(`/author/${encodeURIComponent(ids.get(name) ?? '')}`)}
              />
            ) : (
              names.join(', ')
            )}
          </p>
        )}
        {!items.isPending && <p className={styles.line}>{count === 1 ? '1 book' : `${count} books`}</p>}
        {description && (
          <ExpandableText lines={4} className={styles.bio}>
            <div dangerouslySetInnerHTML={{ __html: description }} />
          </ExpandableText>
        )}
        {next && (
          <PillButton
            variant="primary"
            className={styles.action}
            onClick={() => void navigate(`/book/${next.book.item.id}`)}
          >
            {next.label}
          </PillButton>
        )}
      </HeroBand>

      {items.isPending || progress.isPending ? <BookGridSkeleton count={6} /> : <BookGrid tiles={tiles} />}
    </main>
  );
}
