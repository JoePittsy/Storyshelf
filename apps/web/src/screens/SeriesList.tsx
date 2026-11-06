import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { EmptyState, ImageTile } from '@joepittsy/ui';
import { coverUrl, pickLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { bookCount, seriesAuthors, useSeriesList, withLibrary } from '../api/people';
import styles from './SeriesList.module.css';

/** Library tab: every series A–Z (ABS sorts and pages them), a cover with the name, book count and authors. */
export function SeriesList() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const series = useSeriesList(libraryId);
  const rows = series.data?.pages.flatMap((p) => p.results);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = series;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows?.length]);

  return (
    <main className={styles.page}>
      {libs.isError || series.isError ? (
        <EmptyState title="Can't load series">Check your connection and reload.</EmptyState>
      ) : !rows ? (
        <div className={styles.grid} role="status" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`skeleton ${styles.skeleton}`} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No series yet">Series appear here once your books belong to one.</EmptyState>
      ) : (
        <>
          <ul className={styles.grid}>
            {rows.map((s) => {
              const href = withLibrary(`/series/${encodeURIComponent(s.id)}`, libraryId);
              const first = s.books[0];
              return (
                <li key={s.id}>
                  <ImageTile
                    title={s.name}
                    sub={bookCount(s.books.length)}
                    meta={seriesAuthors(s.books)}
                    imageUrl={first ? coverUrl(first) : null}
                    href={href}
                    onOpen={() => void navigate(href)}
                  />
                </li>
              );
            })}
          </ul>
          <div ref={sentinel} className={styles.sentinel} />
        </>
      )}
    </main>
  );
}
