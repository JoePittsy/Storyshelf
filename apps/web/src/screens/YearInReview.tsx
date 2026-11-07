import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ActivityRow, BarList, ColumnChart, EmptyState, PillButton, SectionCard, Select, StatGrid } from '@joepittsy/ui';
import type { BarListRow, Column } from '@joepittsy/ui';
import { useYearSessions, useYearStats } from '../api/history';
import { coverUrl } from '../api/libraries';
import { LoadFailed } from '../components/LoadFailed';
import { fmtListened } from './historyHelpers';
import { busiestMonth, monthName, monthShort, reviewCards, reviewYears, yearReview, type Ranked } from './yearReview';
import { useNow } from './useNow';
import styles from './History.module.css';

const TOP = 5;
const NAME_MAX = 'clamp(9em, 45cqw, 26em)';

/**
 * People (authors or narrators) for the year. One name is a sentence, not a one-bar chart; none says so plainly.
 */
function People({ title, people, none }: { title: string; people: Ranked[]; none: string }) {
  if (people.length === 0)
    return (
      <SectionCard title={title}>
        <p className={styles.note}>{none}</p>
      </SectionCard>
    );
  const [only] = people;
  if (people.length === 1 && only)
    return (
      <SectionCard title={title}>
        <p className={styles.note}>
          Only <strong className={styles.strong}>{only.name}</strong>, for {fmtListened(only.seconds)}.
        </p>
      </SectionCard>
    );
  const rows: BarListRow[] = people
    .slice(0, TOP)
    .map((x) => ({ key: x.name, name: x.name, value: x.seconds, label: fmtListened(x.seconds) }));
  return (
    <SectionCard title={title} sub="By time listened">
      <BarList rows={rows} ranked nameMax={NAME_MAX} />
    </SectionCard>
  );
}

/**
 * The Stats tab's look back at one year: a few figures, the books, the authors and narrators, and the months. The year
 * is in the address (?year=2025), so a refresh or a shared link keeps it; it defaults to this year. Counted from the
 * listening sessions; the finished books come from ABS's year stats.
 */
export function YearInReview({ days }: { days: Record<string, number> }) {
  const now = useNow();
  const navigate = useNavigate();
  const current = new Date(now).getFullYear();
  const years = useMemo(() => reviewYears(days, current), [days, current]);
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get('year'));
  const year = years.includes(asked) ? asked : current;
  const sessions = useYearSessions(year);
  const stats = useYearStats(year);
  const review = useMemo(() => (sessions.data ? yearReview(sessions.data, year) : null), [sessions.data, year]);

  const pick = (y: number) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (y === current) next.delete('year');
        else next.set('year', String(y));
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  const head = (
    <div className={styles.reviewHead}>
      <h2 id="year-review" className={styles.reviewTitle}>
        {year} in review
      </h2>
      {years.length > 1 && (
        <Select
          label="Year"
          hideLabel
          className={styles.yearPicker}
          value={String(year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(v) => pick(Number(v))}
        />
      )}
    </div>
  );

  let body;
  if (sessions.isError) body = <LoadFailed error={sessions.error} noun="your year" onRetry={() => void sessions.refetch()} />;
  else if (!review) body = <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />;
  else if (review.seconds < 1) {
    const earlier = years.find((y) => y < year);
    body = (
      <EmptyState
        title={year === current ? `Nothing yet in ${year}` : `Nothing in ${year}`}
        action={
          earlier !== undefined && (
            <PillButton onClick={() => pick(earlier)}>See {earlier}</PillButton>
          )
        }
      >
        {year === current ? 'Your year fills in here as you listen.' : 'There was no listening this year.'}
      </EmptyState>
    );
  } else {
    const longest = stats.data?.longestAudiobookFinished;
    const cards = reviewCards(review, stats.data?.numBooksFinished).map((c) =>
      c.label === 'Finished' && longest ? { ...c, sub: `Longest: ${longest.title}` } : c,
    );
    const busy = busiestMonth(review.months);
    const columns: Column[] = review.months.map((s, i) => ({
      key: String(i),
      label: monthShort(i),
      short: monthShort(i).slice(0, 1),
      name: `${monthName(i)} ${year}`,
      value: s,
      valueLabel: s > 0 ? fmtListened(s) : 'Nothing',
    }));
    const books = review.books.slice(0, TOP);
    body = (
      <>
        <StatGrid items={cards} />
        <SectionCard
          title={review.books.length === 1 ? 'Your book' : 'Most listened'}
          sub={
            review.books.length > TOP
              ? `Your top ${TOP} of ${review.books.length} books, by time listened`
              : review.books.length > 1
                ? 'By time listened'
                : undefined
          }
        >
          {/* In order, most first: an ordered list says so without a rank column. */}
          <ol className={styles.chart}>
            {books.map((b) => {
              const open = b.id ? `/book/${b.id}` : undefined;
              return (
                <ActivityRow
                  key={b.id ?? b.title}
                  title={b.title}
                  detail={b.author ?? undefined}
                  imageUrl={b.id ? coverUrl({ id: b.id, updatedAt: 0 }) : undefined}
                  artFit="contain"
                  trailing={fmtListened(b.seconds)}
                  href={open}
                  onOpen={open ? () => void navigate(open) : undefined}
                />
              );
            })}
          </ol>
        </SectionCard>
        <div className={styles.pair}>
          <People title="Authors" people={review.authors} none="These books have no author recorded." />
          <People title="Narrators" people={review.narrators} none="These books have no narrator recorded." />
        </div>
        <SectionCard title="Month by month" sub="Time listened in each month">
          <ColumnChart
            columns={columns}
            label={`Time listened each month of ${year}.${busy !== null ? ` Most in ${monthName(busy)}, ${fmtListened(review.months[busy] ?? 0)}.` : ''}`}
            nameHeading="Month"
            valueHeading="Listened"
          />
        </SectionCard>
      </>
    );
  }

  return (
    <section aria-labelledby="year-review" className={styles.review}>
      {head}
      {body}
    </section>
  );
}
