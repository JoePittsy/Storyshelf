import { useEffect, useMemo, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  ActivityRow,
  BarList,
  EmptyState,
  Heatmap,
  RAMP,
  SectionCard,
  StatGrid,
  Tabs,
  TipRow,
  TipTitle,
} from '@joepittsy/ui';
import type { BarListRow, HeatRow } from '@joepittsy/ui';
import { useChapters, useFinished, useListeningLog, useListeningStats } from '../api/history';
import type { ListeningSession } from '../api/history';
import { coverUrl, mergeProgress, pickLibrary, storedLibrary, useLibraries, useProgress } from '../api/libraries';
import { withLibrary } from '../api/people';
import { BookGrid, BookGridSkeleton } from '../components/BookGrid';
import { LoadFailed } from '../components/LoadFailed';
import {
  chapterRange,
  dayKey,
  dayLabel,
  deviceLabel,
  fmtDate,
  fmtListened,
  fmtTimeOfDay,
  groupByDay,
  heatGrid,
  heatLevel,
  periodTotals,
  topAuthors,
  topBooks,
} from './historyHelpers';
import { useNow } from './useNow';
import styles from './History.module.css';

const SECTIONS = [
  { key: 'log', label: 'Log', path: '/history' },
  { key: 'finished', label: 'Finished', path: '/history/finished' },
  { key: 'stats', label: 'Stats', path: '/history/stats' },
] as const;

/** The History page: a title and the Log, Finished and Stats tabs, each its own route. */
export function History() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const libs = useLibraries();
  const library = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const current = SECTIONS.find((s) => s.path === pathname.replace(/\/$/, '')) ?? SECTIONS[0];
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>History</h1>
      <Tabs
        label="History sections"
        current={current.key}
        items={SECTIONS.map((s) => ({ key: s.key, label: s.label, href: withLibrary(s.path, library) }))}
        onNavigate={(href) => void navigate(href)}
      />
      <Outlet />
    </main>
  );
}

/** Calls `onEnd` when the element scrolls near the viewport. */
function EndSentinel({ onEnd }: { onEnd: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && onEnd(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [onEnd]);
  return <div ref={ref} className={styles.sentinel} />;
}

const NOTHING_YET = (
  <EmptyState title="Nothing yet">Press play on a book and your listening will show up here.</EmptyState>
);

function SessionList({ sessions }: { sessions: ListeningSession[] }) {
  const navigate = useNavigate();
  const now = useNow();
  const ids = useMemo(() => [...new Set(sessions.flatMap((s) => (s.libraryItemId ? [s.libraryItemId] : [])))], [sessions]);
  const chapters = useChapters(ids);
  const days = useMemo(() => groupByDay(sessions, (s) => s.startedAt), [sessions]);

  return (
    <div className={styles.days}>
      {days.map((d) => (
        <section key={d.key} aria-labelledby={`day-${d.key}`} className={styles.day}>
          <h2 id={`day-${d.key}`} className={styles.dayHead}>
            {dayLabel(d.key, now)}
            <span className={styles.dayTotal}>{fmtListened(d.items.reduce((t, s) => t + s.timeListening, 0))}</span>
          </h2>
          <ul className={styles.list}>
            {d.items.map((s) => {
              const info = s.libraryItemId ? chapters.get(s.libraryItemId) : undefined;
              const open = s.libraryItemId ? `/book/${s.libraryItemId}` : undefined;
              return (
                <ActivityRow
                  key={s.id}
                  title={s.displayTitle}
                  imageUrl={s.libraryItemId ? coverUrl({ id: s.libraryItemId, updatedAt: 0 }) : undefined}
                  artFit="contain"
                  when={fmtTimeOfDay(s.startedAt)}
                  // Hold the line back until the chapters arrive, so it doesn't flip from a time range to chapters.
                  detail={info?.state === 'pending' ? undefined : chapterRange(info?.chapters ?? [], s.startTime, s.currentTime)}
                  note={deviceLabel(s.deviceInfo) || undefined}
                  trailing={fmtListened(s.timeListening)}
                  href={open}
                  onOpen={open ? () => void navigate(open) : undefined}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Beside the log on a wide screen: how much, this week and this month. */
function LogSummary() {
  const now = useNow();
  const { data } = useListeningStats();
  if (!data) return null;
  const totals = periodTotals(data.days, dayKey(now));
  return (
    <aside className={styles.aside} aria-label="Listening totals">
      <StatGrid
        items={[
          { label: 'This week', value: fmtListened(totals.week) },
          { label: 'This month', value: fmtListened(totals.month) },
        ]}
      />
    </aside>
  );
}

export function HistoryLog() {
  const log = useListeningLog();
  const sessions = useMemo(() => log.data?.pages.flatMap((p) => p.sessions) ?? [], [log.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
  const more = useMemo(
    () => (hasNextPage && !isFetchingNextPage ? () => void fetchNextPage() : undefined),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  if (log.isError && !log.data) return <LoadFailed error={log.error} noun="listening history" onRetry={() => void log.refetch()} />;
  if (log.isPending) return <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />;
  if (sessions.length === 0 && !hasNextPage) return NOTHING_YET;

  return (
    <div className={styles.logLayout}>
      <div className={styles.logMain}>
        <SessionList sessions={sessions} />
        {isFetchingNextPage && (
          <p role="status" className={styles.more}>
            Loading more…
          </p>
        )}
        {more && <EndSentinel onEnd={more} />}
        {log.isError && (
          <LoadFailed error={log.error} noun="listening history" onRetry={() => void fetchNextPage()} />
        )}
      </div>
      <LogSummary />
    </div>
  );
}

export function HistoryFinished() {
  const [params] = useSearchParams();
  const libs = useLibraries();
  const library = libs.data ? pickLibrary(libs.data, params.get('library'), storedLibrary()) : undefined;
  const finished = useFinished(library);
  const progress = useProgress();
  const now = useNow();

  const tiles = useMemo(() => {
    const items = finished.data?.pages.flatMap((p) => p.results) ?? [];
    const map = progress.data ?? new Map();
    return mergeProgress(items, map).map(({ item }) => {
      const at = map.get(item.id)?.finishedAt;
      return { item, progress: 1, meta: at ? `Finished ${fmtDate(at, now, 'always')}` : undefined };
    });
  }, [finished.data, progress.data, now]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = finished;
  if (libs.isError || finished.isError)
    return <LoadFailed error={finished.error ?? libs.error} noun="finished books" onRetry={() => void (libs.isError ? libs.refetch() : finished.refetch())} />;
  if (libs.isPending || (!!library && finished.isPending)) return <BookGridSkeleton />;
  if (tiles.length === 0)
    return <EmptyState title="No finished books yet">Books you finish will be listed here, newest first.</EmptyState>;
  return (
    <BookGrid
      tiles={tiles}
      onEndReached={!hasNextPage || isFetchingNextPage ? undefined : () => void fetchNextPage()}
    />
  );
}

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const TOP = 8;

export function HistoryStats() {
  const stats = useListeningStats();
  const now = useNow();
  const today = dayKey(now);

  const view = useMemo(() => {
    if (!stats.data) return null;
    const { days, items, totalTime } = stats.data;
    const grid = heatGrid(days, today);
    const max = Math.max(0, ...grid.rows.flatMap((r) => r.map((c) => c.seconds ?? 0)));
    const rows: HeatRow[] = grid.rows.map((r, i) => ({
      key: String(i),
      label: WEEKDAYS[i],
      cells: r.map((c) => (c.seconds ? RAMP[heatLevel(c.seconds, max, RAMP.length)] ?? null : null)),
    }));
    const bars = (list: { key: string; name: string; seconds: number }[]): BarListRow[] =>
      list.map((x) => ({ key: x.key, name: x.name, value: x.seconds, label: fmtListened(x.seconds) }));
    return {
      totals: periodTotals(days, today),
      allTime: totalTime,
      grid,
      max,
      rows,
      books: bars(topBooks(items, TOP).map((b) => ({ key: b.id, name: b.title, seconds: b.seconds }))),
      authors: bars(topAuthors(items, TOP).map((a) => ({ key: a.name, name: a.name, seconds: a.seconds }))),
    };
  }, [stats.data, today]);

  if (stats.isError) return <LoadFailed error={stats.error} noun="listening stats" onRetry={() => void stats.refetch()} />;
  if (!view) return <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />;
  if (view.allTime <= 0) return NOTHING_YET;

  const cell = (r: number, c: number) => view.grid.rows[r]?.[c];
  const describe = (r: number, c: number) => {
    const x = cell(r, c);
    if (!x) return '';
    const label = dayLabel(x.key, now);
    return x.seconds === null ? `${label}: not yet` : x.seconds ? `${label}: ${fmtListened(x.seconds)}` : `${label}: no listening`;
  };

  return (
    <div className={styles.stats}>
      <StatGrid
        items={[
          { label: 'This week', value: fmtListened(view.totals.week) },
          { label: 'This month', value: fmtListened(view.totals.month) },
          { label: 'This year', value: fmtListened(view.totals.year) },
          { label: 'All time', value: fmtListened(view.allTime) },
        ]}
      />
      <SectionCard title="Every day" sub="Time listened over the last year. Weeks start on Monday.">
        <Heatmap
          columns={view.grid.columns}
          rows={view.rows}
          minCell="1em"
          cellHeight="1.1em"
          startAtEnd
          ariaLabel="Time listened each day over the last year"
          cellLabel={describe}
          renderTip={(r, c) => (
            <>
              <TipTitle>{dayLabel(cell(r, c)?.key ?? today, now)}</TipTitle>
              <TipRow name="Listened" value={cell(r, c)?.seconds ? fmtListened(cell(r, c)?.seconds ?? 0) : 'Nothing'} />
            </>
          )}
          legend={{ lo: 'Less', hi: `More (${fmtListened(view.max)} in a day)`, empty: 'nothing' }}
        />
      </SectionCard>
      <div className={styles.pair}>
        <SectionCard title="Top books" sub="By time listened">
          <BarList rows={view.books} ranked nameMax="clamp(8em, 28cqw, 16em)" />
        </SectionCard>
        <SectionCard title="Top authors" sub="By time listened">
          <BarList rows={view.authors} ranked nameMax="clamp(8em, 28cqw, 16em)" />
        </SectionCard>
      </div>
    </div>
  );
}
