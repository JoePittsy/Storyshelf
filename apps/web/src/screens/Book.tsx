import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Artwork, EmptyState, ExpandableText, HeroBand, ListRow, PillButton, ProgressBar } from '@joepittsy/ui';
import { AbsError } from '../api/auth';
import { coverUrl, useBook } from '../api/items';
import { currentChapterIndex, fmtClock, fmtLong, playFrom, playLabel, sanitiseDescription } from './bookHelpers';
import styles from './Book.module.css';

interface Props {
  onPlay?: (fromSeconds: number) => void;
  onChapter?: (startSeconds: number) => void;
}

// PLACEHOLDER: player slice
const noop = () => undefined;

/** Back to the library as the user left it (query string and all) when there is history, else to /. */
function BackLink() {
  const navigate = useNavigate();
  const hasHistory = useLocation().key !== 'default';
  const onClick = (e: MouseEvent) => {
    if (!hasHistory) return;
    e.preventDefault();
    void navigate(-1);
  };
  return (
    <Link to="/" className={styles.back} onClick={onClick}>
      <span aria-hidden="true">← </span>Library
    </Link>
  );
}

export function Book({ onPlay = noop, onChapter = noop }: Props) {
  const { id = '' } = useParams();
  const { data: item, error, isPending, refetch } = useBook(id);
  const description = useMemo(
    () => (item?.media.metadata.description ? sanitiseDescription(item.media.metadata.description) : ''),
    [item],
  );

  if (isPending)
    return (
      <main className={styles.page}>
        <BackLink />
        <div className={`skeleton ${styles.loading}`} role="status" aria-label="Loading" />
      </main>
    );

  if (!item) {
    const missing = error instanceof AbsError && error.status === 404;
    return (
      <main className={styles.page}>
        <BackLink />
        <EmptyState
          className={styles.state}
          title={missing ? "This book isn't in your library" : "Couldn't load this book"}
          action={
            missing ? (
              <Link to="/">Back to your library</Link>
            ) : (
              <PillButton variant="primary" onClick={() => void refetch()}>
                Try again
              </PillButton>
            )
          }
        >
          {missing ? undefined : "Check your connection and try again. If it keeps happening, the server may be down."}
        </EmptyState>
      </main>
    );
  }

  const { metadata: m, duration, chapters } = item.media;
  const p = item.userMediaProgress;
  const label = playLabel(p);
  const chapterIdx = p ? currentChapterIndex(chapters, p.currentTime) : -1;
  const started = !!p && p.currentTime > 0 && !p.isFinished;

  const status = p?.isFinished
    ? 'Finished'
    : started
      ? [`${fmtLong(duration - p.currentTime)} left`, chapterIdx >= 0 && `Chapter ${chapterIdx + 1} of ${chapters.length}`]
          .filter(Boolean)
          .join(' · ')
      : fmtLong(duration);
  const series = m.series.map((s) => (s.sequence ? `${s.name} #${s.sequence}` : s.name)).join(', ');
  const meta = [m.publishedYear, fmtLong(duration)].filter(Boolean).join(' · ');

  return (
    <main className={styles.page}>
      <BackLink />
      <HeroBand
        art={<Artwork src={coverUrl(item.id, item.updatedAt)} placeholderClassName={styles.ph} lazy={false} />}
        title={m.title}
      >
        {m.subtitle && <p className={styles.sub}>{m.subtitle}</p>}
        {m.authors.length > 0 && <p className={styles.line}>{m.authors.map((a) => a.name).join(', ')}</p>}
        {m.narrators.length > 0 && <p className={styles.line}>Narrated by {m.narrators.join(', ')}</p>}
        {series && <p className={styles.line}>{series}</p>}
        <p className={styles.line}>{meta}</p>
        <div className={styles.progress}>
          <ProgressBar value={p?.isFinished ? 1 : (p?.progress ?? 0)} label={`Progress through ${m.title}`} />
          <p className={styles.line}>{status}</p>
        </div>
        <PillButton variant="primary" className={styles.action} onClick={() => onPlay(playFrom(p))}>
          {label}
        </PillButton>
      </HeroBand>

      {description && (
        <section className={styles.section} aria-labelledby="about">
          <h2 id="about" className={styles.heading}>
            About this book
          </h2>
          <ExpandableText>
            <div dangerouslySetInnerHTML={{ __html: description }} />
          </ExpandableText>
        </section>
      )}

      {chapters.length > 0 && (
        <section className={styles.section} aria-labelledby="chapters">
          <h2 id="chapters" className={styles.heading}>
            Chapters
          </h2>
          <ul className={styles.chapters}>
            {chapters.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.title}
                aside={fmtClock(c.start)}
                trailing={fmtClock(c.end - c.start, false)}
                current={i === chapterIdx}
                onClick={() => onChapter(c.start)}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
