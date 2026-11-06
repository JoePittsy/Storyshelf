import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { EmptyState, ImageTile, ProgressBar, SearchField, Select } from '@joepittsy/ui';
import {
  SORTS,
  coverUrl,
  mergeProgress,
  parseSort,
  pickLibrary,
  storedLibrary,
  useLibraries,
  useLibraryItems,
  useLibrarySearch,
  useProgress,
} from '../api/libraries';
import type { LibraryItem } from '../api/libraries';
import styles from './Library.module.css';

const SORT_OPTIONS = SORTS.map((s) => ({ value: s.key, label: s.label }));

export function Library() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sort = parseSort(params.get('sort'));
  const q = params.get('q')?.trim() ?? '';
  const [text, setText] = useState(params.get('q') ?? '');

  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const progress = useProgress();
  const items = useLibraryItems(libraryId, sort);
  const search = useLibrarySearch(libraryId, q);
  const searching = q !== '';

  // Debounce typing into the URL, keeping the other params.
  useEffect(() => {
    const t = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (text.trim()) next.set('q', text.trim());
          else next.delete('q');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const list: LibraryItem[] = useMemo(
    () => (searching ? (search.data ?? []) : (items.data?.pages.flatMap((p) => p.results) ?? [])),
    [searching, search.data, items.data],
  );
  const tiles = useMemo(() => mergeProgress(list, progress.data ?? new Map()), [list, progress.data]);

  const active = searching ? search : items;
  const loading = libs.isPending || (!!libraryId && active.isPending);
  const failed = libs.isError || active.isError;

  // Load the next page when the sentinel scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || searching || !hasNextPage) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [searching, hasNextPage, isFetchingNextPage, fetchNextPage, tiles.length]);

  return (
    <main className={styles.page}>
      <div className={styles.controls}>
        <SearchField label="Search books" placeholder="Search title or author" value={text} onChange={setText} />
        {!searching && (
          <Select
            label="Sort by"
            value={sort}
            options={SORT_OPTIONS}
            onChange={(v) =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('sort', v);
                  return next;
                },
                { replace: true },
              )
            }
          />
        )}
      </div>
      {failed ? (
        <EmptyState title="Can't load the library">
          Check your connection and reload.
        </EmptyState>
      ) : loading ? (
        <div className={styles.grid} role="status" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`skeleton ${styles.skeleton}`} />
          ))}
        </div>
      ) : tiles.length === 0 ? (
        searching ? (
          <EmptyState title="No results">
            Nothing matches “{q}”. Check the spelling or try a shorter search.
          </EmptyState>
        ) : (
          <EmptyState title="This library is empty">
            Add audiobooks on your server and they will appear here.
          </EmptyState>
        )
      ) : (
        <>
          <ul className={styles.grid}>
            {tiles.map(({ item, progress: p }) => (
              <li key={item.id}>
                <ImageTile
                  title={item.media.metadata.title}
                  sub={item.media.metadata.authorName}
                  imageUrl={coverUrl(item)}
                  href={`/book/${item.id}`}
                  onOpen={() => void navigate(`/book/${item.id}`)}
                  overlay={
                    <ProgressBar variant="overlay" value={p} label={`Progress through ${item.media.metadata.title}`} />
                  }
                />
              </li>
            ))}
          </ul>
          <div ref={sentinel} className={styles.sentinel} />
        </>
      )}
    </main>
  );
}
