import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { EmptyState, ImageTile } from '@joepittsy/ui';
import { useBookLists, useListCounts } from '../api/bookLists';
import type { ListKind } from '../api/bookLists';
import { coverUrl, pickLibrary, storedLibrary, useLibraries } from '../api/libraries';
import { bookCount, withLibrary } from '../api/people';
import { LibrarySections } from '../components/LibrarySections';
import styles from './SeriesList.module.css';

const COPY = {
  collection: {
    title: 'Collections',
    failed: "Can't load collections",
    empty: 'No collections in this library',
    emptyHint: 'Collections made in Audiobookshelf appear here.',
  },
  playlist: {
    title: 'Playlists',
    failed: "Can't load playlists",
    empty: 'No playlists in this library',
    emptyHint: 'Playlists you make in Audiobookshelf appear here.',
  },
} as const;

/** Library › Collections: the library's collections, made by admins in ABS. */
export function CollectionList() {
  return <BookListIndex kind="collection" />;
}

/** Library › Playlists: the listener's own playlists in this library. */
export function PlaylistList() {
  return <BookListIndex kind="playlist" />;
}

/** A grid of collections or playlists, each its first book's cover, its name and how many books it has. */
function BookListIndex({ kind }: { kind: ListKind }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const { counts } = useListCounts(libraryId);
  const lists = useBookLists(kind, libraryId);
  const rows = lists.data?.pages.flatMap((p) => p.results);
  const copy = COPY[kind];

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = lists;
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
      {/* The section tab already says which list this is; the heading stays for screen readers, as Library does. */}
      <h1 className={styles.srOnly}>{copy.title}</h1>
      <LibrarySections current={`${kind}s`} libraryId={libraryId} counts={counts} />
      {libs.isError || lists.isError ? (
        <EmptyState title={copy.failed}>Check your connection and reload.</EmptyState>
      ) : !rows ? (
        <div className={styles.grid} role="status" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`skeleton ${styles.skeleton}`} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={copy.empty}>{copy.emptyHint}</EmptyState>
      ) : (
        <>
          <ul className={styles.grid}>
            {rows.map((list) => {
              const href = withLibrary(`/${kind}/${encodeURIComponent(list.id)}`, libraryId);
              const first = list.books[0];
              return (
                <li key={list.id}>
                  <ImageTile
                    title={list.name}
                    sub={bookCount(list.books.length)}
                    imageUrl={first ? coverUrl(first) : null}
                    artFit="contain"
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
