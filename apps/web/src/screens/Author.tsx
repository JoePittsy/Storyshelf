import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ExpandableText, HeroBand, TitleButton, UserAvatar } from '@joepittsy/ui';
import { useAuthor } from '../api/authors';
import { authorImageUrl, mergeProgress, seriesPath, useProgress } from '../api/libraries';
import { useDocumentTitle } from '../frame/useDocumentTitle';
import { BackLink } from '../components/BackLink';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import type { BookTile } from '../components/BookGrid';
import { LoadFailed } from '../components/LoadFailed';
import { sanitiseDescription } from './bookHelpers';
import { groupAuthorBooks, sequenceBadge } from './seriesHelpers';
import type { SeriesBook } from './seriesHelpers';
import styles from './Collection.module.css';

/** An author: photo, name, bio, then their books by series in reading order and the rest as "Other books" (REQ-27). */
export function Author() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const author = useAuthor(id);
  const progress = useProgress();
  const { data } = author;
  useDocumentTitle(data?.name);

  const bio = useMemo(() => (data?.description ? sanitiseDescription(data.description) : ''), [data]);
  const { sections, other } = useMemo(() => groupAuthorBooks(data?.series, data?.libraryItems), [data]);

  const tiles = (books: SeriesBook[]): BookTile[] =>
    mergeProgress(
      books.map((b) => b.item),
      progress.data ?? new Map()
    ).map((t, i) => ({ item: t.item, progress: t.progress, badge: sequenceBadge(books[i]?.sequence ?? null) }));

  if (!data)
    return (
      <main className={styles.page}>
        <BackLink />
        {author.isPending ? (
          <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />
        ) : (
          <div className={styles.state}>
            <LoadFailed error={author.error} noun="author" onRetry={() => void author.refetch()} />
          </div>
        )}
      </main>
    );

  const count = data.libraryItems?.length ?? 0;
  return (
    <main className={styles.page}>
      <BackLink />
      <HeroBand
        kind="Author"
        title={data.name}
        art={<UserAvatar name={data.name} imageUrl={authorImageUrl(data, 400)} className={styles.avatar} />}
      >
        <p className={styles.line}>{count === 1 ? '1 book' : `${count} books`}</p>
        {bio && (
          <ExpandableText lines={5} className={styles.bio}>
            <div dangerouslySetInnerHTML={{ __html: bio }} />
          </ExpandableText>
        )}
      </HeroBand>

      {progress.isPending && count > 0 ? (
        <BookGridSkeleton count={6} />
      ) : (
        <div className={styles.sections}>
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={`series-${s.id}`}>
              <h2 id={`series-${s.id}`} className={styles.heading}>
                <TitleButton title={s.name} href={seriesPath(s.id)} onOpen={() => void navigate(seriesPath(s.id))} />
              </h2>
              <BookGrid tiles={tiles(s.books)} />
            </section>
          ))}
          {other.length > 0 && (
            <section aria-labelledby="other-books">
              <h2 id="other-books" className={styles.heading}>
                {sections.length > 0 ? 'Other books' : 'Books'}
              </h2>
              <BookGrid tiles={tiles(other)} />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
