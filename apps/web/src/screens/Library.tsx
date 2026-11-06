import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Chip, EmptyState, PillButton, SearchField, Select } from '@joepittsy/ui';
import {
  SORTS,
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
import {
  MAX_EXTRA_PAGES,
  NO_FILTERS,
  WANT_VISIBLE,
  clientFilters,
  countActive,
  hasFilterParams,
  matchesFilters,
  parseFilters,
  serverFilterValue,
  storeFilters,
  storedFilters,
  useFilterData,
  writeFilters,
} from '../api/filters';
import type { Filters } from '../api/filters';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import { LibraryFilters } from '../components/LibraryFilters';
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
  const searching = q !== '';

  // Filters live in the URL. ABS can apply one per request; the rest are applied here, to loaded pages.
  const filters = useMemo(() => parseFilters(params), [params]);
  const serverFilter = searching ? undefined : serverFilterValue(filters);
  const local = clientFilters(filters, !searching);
  const localActive = countActive(local) > 0;
  const localKey = `${writeFilters(new URLSearchParams(), local).toString()}|${serverFilter ?? ''}`;
  const filterData = useFilterData(libraryId);

  const items = useLibraryItems(libraryId, sort, serverFilter);
  const search = useLibrarySearch(libraryId, q);

  const changeFilters = (next: Filters) => {
    setParams((prev) => writeFilters(prev, next));
    if (libraryId) storeFilters(libraryId, next);
  };

  // Arriving at a library with no filters in the URL: bring back the ones last used here on this device.
  const restored = useRef(new Set<string>());
  useEffect(() => {
    if (!libraryId || restored.current.has(libraryId)) return;
    restored.current.add(libraryId);
    if (hasFilterParams(params)) return;
    const saved = storedFilters(libraryId);
    if (countActive(saved) > 0) setParams((prev) => writeFilters(prev, saved), { replace: true });
  }, [libraryId, params, setParams]);

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
    () => (searching ? (search.data?.books ?? []) : (items.data?.pages.flatMap((p) => p.results) ?? [])),
    [searching, search.data, items.data],
  );
  const tiles = useMemo(() => {
    const map = progress.data ?? new Map();
    return mergeProgress(
      localActive ? list.filter((i) => matchesFilters(i, local, map)) : list,
      map,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `local` is fully described by localKey
  }, [list, progress.data, localActive, localKey]);

  const active = searching ? search : items;
  const loading = libs.isPending || (!!libraryId && active.isPending) || (!!local.progress && progress.isPending);
  const failed = libs.isError || active.isError;

  const chips = searching ? (search.data?.chips ?? []) : [];

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = items;
  const pagesLoaded = items.data?.pages.length ?? 0;
  const total = items.data?.pages[0]?.total;

  // Filtering here can leave a page nearly empty, so keep loading until a screenful shows or the budget runs out.
  // Each scroll to the end (or press of "Load more") buys another budget; changing filters starts over.
  const [scrolls, setScrolls] = useState({ key: '', n: 0 });
  const budget = (1 + MAX_EXTRA_PAGES) * ((scrolls.key === localKey ? scrolls.n : 0) + 1);
  const short = !searching && localActive && !!hasNextPage && tiles.length < WANT_VISIBLE;
  useEffect(() => {
    if (short && !isFetchingNextPage && pagesLoaded < budget) void fetchNextPage();
  }, [short, isFetchingNextPage, pagesLoaded, budget, fetchNextPage]);
  const loadMore = () => {
    setScrolls({ key: localKey, n: (scrolls.key === localKey ? scrolls.n : 0) + 1 });
    void fetchNextPage();
  };
  const loadingMore = short && (isFetchingNextPage || pagesLoaded < budget);
  const filtered = countActive(filters) > 0;

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
      <LibraryFilters filters={filters} onChange={changeFilters} data={filterData.data} />
      {filters.narrator && <h2 className={styles.heading}>Narrated by {filters.narrator}</h2>}
      {!searching && !loading && !failed && !localActive && total !== undefined && (
        <p className={styles.count}>{total} {total === 1 ? 'book' : 'books'}</p>
      )}
      {chips.length > 0 && (
        <ul className={styles.chips} aria-label="Matching authors, narrators and series">
          {chips.map((c) => (
            <li key={c.key}>
              <Chip label={c.label} kind={c.kind} avatar={c.avatar} href={c.href} onOpen={() => void navigate(c.href)} />
            </li>
          ))}
        </ul>
      )}
      {failed ? (
        <EmptyState title="Can't load the library">
          Check your connection and reload.
        </EmptyState>
      ) : loading ? (
        <BookGridSkeleton />
      ) : tiles.length === 0 ? (
        loadingMore ? (
          <p role="status" className={styles.more}>Loading more…</p>
        ) : filtered && !searching && hasNextPage ? (
          <EmptyState
            title="No matches in the books loaded so far"
            action={<PillButton onClick={loadMore}>Load more</PillButton>}
          >
            Load more books, or remove a filter.
          </EmptyState>
        ) : filtered ? (
          <EmptyState
            title="No books match these filters"
            action={<PillButton onClick={() => changeFilters(NO_FILTERS)}>Clear all filters</PillButton>}
          >
            Try removing one.
          </EmptyState>
        ) : searching ? (
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
          <BookGrid
            tiles={tiles}
            onEndReached={searching || !hasNextPage || isFetchingNextPage || loadingMore ? undefined : loadMore}
          />
          {loadingMore && <p role="status" className={styles.more}>Loading more…</p>}
          {short && !loadingMore && !isFetchingNextPage && (
            <PillButton className={styles.moreButton} onClick={loadMore}>
              Load more
            </PillButton>
          )}
        </>
      )}
    </main>
  );
}
