import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { EmptyState, UserAvatar } from '@joepittsy/ui';
import { mergeProgress, pickLibrary, storedLibrary, useLibraries, useProgress } from '../api/libraries';
import { bookCount, decodeName, useNarratorBooks } from '../api/people';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import styles from './Narrator.module.css';

/** /narrator/:name: who they are, how many books, and the books themselves. Narrators have no id in ABS; the name is the key. */
export function Narrator() {
  const name = decodeName(useParams().name ?? '');
  const [params] = useSearchParams();
  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const progress = useProgress();
  const books = useNarratorBooks(libraryId, name);
  const tiles = useMemo(() => mergeProgress(books.data ?? [], progress.data ?? new Map()), [books.data, progress.data]);

  const failed = libs.isError || books.isError;
  const loading = libs.isPending || (!!libraryId && books.isPending);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <UserAvatar name={name || '?'} className={styles.avatar} />
        <div className={styles.who}>
          <h1 className={styles.name}>{name}</h1>
          {books.data && books.data.length > 0 && <p className={styles.count}>{bookCount(books.data.length)}</p>}
        </div>
      </header>
      {failed ? (
        <EmptyState title="Can't load this narrator">Check your connection and reload.</EmptyState>
      ) : loading ? (
        <BookGridSkeleton />
      ) : tiles.length === 0 ? (
        <EmptyState title="Not found">We couldn't find any books narrated by {name} in this library.</EmptyState>
      ) : (
        <BookGrid tiles={tiles} />
      )}
    </main>
  );
}
