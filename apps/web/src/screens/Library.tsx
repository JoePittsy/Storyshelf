import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Chip, EmptyState, PillButton, SearchField, Select } from '@joepittsy/ui';
import {
  mergeProgress,
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
import { SORT_CHOICES, choiceOf, resolveSort, sortOfChoice, storeSort, storedSort, writeSort } from '../api/sort';
import { useInProgress } from '../api/history';
import { useListCounts } from '../api/bookLists';
import { LibrarySections } from '../components/LibrarySections';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import { LibraryFilters } from '../components/LibraryFilters';
import { ResumeHome } from '../components/ResumeHome';
import styles from './Library.module.css';

const SORT_OPTIONS = SORT_CHOICES.map((c) => ({ value: c.value, label: c.label }));

interface Props {
  /** Resumes a book from the Continue listening shelf. */
  onPlay?: (itemId: string) => void;
}

const noop = () => undefined;

export function Library({ onPlay = noop }: Props) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [text, setText] = useState(params.get('q') ?? '');

  const libs = useLibraries();
  const libraryId = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  // The URL's sort, else the one last used in this library (written into the URL below), so ABS is asked once.
  const sort = resolveSort(params, libraryId);
  const progress = useProgress();
  const searching = q !== '';

  // Filters live in the URL. ABS can apply one per request; the rest are applied here, to loaded pages.
  const filters = useMemo(() => parseFilters(params), [params]);
  const serverFilter = searching ? undefined : serverFilterValue(filters);
  const local = clientFilters(filters, !searching);
  const localActive = countActive(local) > 0;
  const localKey = `${writeFilters(new URLSearchParams(), local).toString()}|${serverFilter ?? ''}`;
  const filterData = useFilterData(libraryId);

  // Whether to offer Collections and Playlists. The tabs sit above everything, so the shelf and grid wait for the answer
  // rather than be pushed down by it.
  const lists = useListCounts(libraryId);
  const items = useLibraryItems(libraryId, sort.key, serverFilter, sort.desc);
  const search = useLibrarySearch(libraryId, q);

  const changeFilters = (next: Filters) => {
    setParams((prev) => writeFilters(prev, next));
    if (libraryId) storeFilters(libraryId, next);
  };

  const changeSort = (value: string) => {
    const next = sortOfChoice(value);
    setParams((prev) => writeSort(prev, next), { replace: true });
    if (libraryId) storeSort(libraryId, next);
  };

  // Arriving at a library with no filters or sort in the URL: bring back the ones last used here on this device. One
  // update for both, as the router doesn't chain two in a row.
  const restored = useRef(new Set<string>());
  useEffect(() => {
    if (!libraryId || restored.current.has(libraryId)) return;
    restored.current.add(libraryId);
    const savedFilters = hasFilterParams(params) ? null : storedFilters(libraryId);
    const withFilters = !!savedFilters && countActive(savedFilters) > 0;
    const savedSort = params.has('sort') ? null : storedSort(libraryId);
    if (!withFilters && !savedSort) return;
    setParams(
      (prev) => {
        const next = withFilters ? writeFilters(prev, savedFilters) : prev;
        return savedSort ? writeSort(next, savedSort) : next;
      },
      { replace: true }
    );
  }, [libraryId, params, setParams]);

  // The box and the URL's q are two copies of one thing. Typing reaches the URL after a pause (below); a change the
  // box didn't make (following a narrator chip lands on this same route without q) has to reach the box, or the box
  // would write its old text straight back.
  const written = useRef(q);
  useEffect(() => {
    if (q === written.current) return;
    written.current = q;
    setText(q);
  }, [q]);

  // Debounce typing into the URL, keeping the other params.
  useEffect(() => {
    const t = setTimeout(() => {
      const wanted = text.trim();
      if (wanted === written.current) return;
      written.current = wanted;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (wanted) next.set('q', wanted);
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    }, 300);
    return () => clearTimeout(t);
  }, [text, setParams]);

  const list: LibraryItem[] = useMemo(
    () => (searching ? (search.data?.books ?? []) : (items.data?.pages.flatMap((p) => p.results) ?? [])),
    [searching, search.data, items.data]
  );
  const tiles = useMemo(() => {
    const map = progress.data ?? new Map();
    return mergeProgress(localActive ? list.filter((i) => matchesFilters(i, local, map)) : list, map);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `local` is fully described by localKey
  }, [list, progress.data, localActive, localKey]);

  const active = searching ? search : items;
  // The Continue listening shelf sits above the grid. If it arrived after the grid it would push the tiles down under
  // the pointer, so the grid stays a skeleton until the shelf's data is in: only the skeleton is ever pushed. The
  // shelf stays mounted throughout (it renders nothing until it has books), so a failed query isn't refetched on
  // every mount and unmount.
  const inProgress = useInProgress();
  const filtered = countActive(filters) > 0;
  const showShelf = !searching && !filtered && !!libraryId;
  const shelfPending = showShelf && (inProgress.isPending || progress.isPending);
  const loading =
    libs.isPending || (!!libraryId && (active.isPending || !lists.settled)) || (!!local.progress && progress.isPending) || shelfPending;
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

  // The grid's own heading: what it lists, and how many. The count is the server's total only while nothing is
  // narrowed here; a client-side filter or a search counts what it found, and says nothing while more is still to load.
  const counted = searching ? tiles.length : localActive ? (hasNextPage ? undefined : tiles.length) : total;
  const heading = searching
    ? 'Search results'
    : filters.narrator
      ? `Narrated by ${filters.narrator}`
      : filtered
        ? 'Matching books'
        : 'All books';

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Library</h1>
      <LibrarySections current="books" libraryId={libraryId} counts={lists.counts} />
      {/* Not while searching or filtering: it would sit among narrowed results. Mounted once the section tabs are
          settled, so they never push it down. */}
      {showShelf && lists.settled && <ResumeHome libraryId={libraryId} onPlay={onPlay} />}
      <div className={styles.toolbar}>
        <SearchField label="Search books" placeholder="Search title or author" value={text} onChange={setText} />
        {!searching && (
          <Select label="Sort by" value={choiceOf(sort).value} options={SORT_OPTIONS} onChange={changeSort} />
        )}
        <LibraryFilters filters={filters} onChange={changeFilters} data={filterData.data} />
      </div>
      {!loading && !failed && tiles.length > 0 && (
        <h2 className={styles.heading}>
          {heading}
          {counted !== undefined && ` · ${counted}`}
        </h2>
      )}
      {chips.length > 0 && (
        <ul className={styles.chips} aria-label="Matching authors, narrators and series">
          {chips.map((c) => (
            <li key={c.key}>
              <Chip
                label={c.label}
                kind={c.kind}
                avatar={c.avatar}
                href={c.href}
                onOpen={() => void navigate(c.href)}
              />
            </li>
          ))}
        </ul>
      )}
      {failed ? (
        <EmptyState title="Can't load the library">Check your connection and reload.</EmptyState>
      ) : loading ? (
        <BookGridSkeleton />
      ) : tiles.length === 0 ? (
        loadingMore ? (
          <p role="status" className={styles.more}>
            Loading more…
          </p>
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
          <EmptyState title="No results">Nothing matches “{q}”. Check the spelling or try a shorter search.</EmptyState>
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
          {loadingMore && (
            <p role="status" className={styles.more}>
              Loading more…
            </p>
          )}
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
