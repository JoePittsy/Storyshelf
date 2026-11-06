import { Fragment, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Artwork,
  DetailList,
  EmptyState,
  ExpandableText,
  HeroBand,
  ListRow,
  PeopleLinks,
  PillButton,
  TitleButton,
  ProgressBar,
} from '@joepittsy/ui';
import type { DetailItem } from '@joepittsy/ui';
import { AbsError } from '../api/auth';
import { coverUrl, useBook } from '../api/items';
import { narratorPath } from '../api/libraries';
import {
  bookDetails,
  currentChapterIndex,
  fmtClock,
  fmtLong,
  playFrom,
  playLabel,
  sanitiseDescription,
} from './bookHelpers';
import { BackLink } from '../components/BackLink';
import { BookListening } from '../components/BookListening';
import styles from './Book.module.css';

interface Props {
  onPlay?: (fromSeconds: number) => void;
  onChapter?: (startSeconds: number) => void;
}

/** More than this many narrators and the hero says "and N more"; Details has them all. */
const NARRATORS_IN_HERO = 3;

// Default handlers for stories/tests; the app wires onPlay/onChapter to the player in App.tsx.
const noop = () => undefined;

export function Book({ onPlay = noop, onChapter = noop }: Props) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: item, error, isPending, refetch } = useBook(id);
  const description = useMemo(
    () => (item?.media.metadata.description ? sanitiseDescription(item.media.metadata.description) : ''),
    [item]
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
          {missing ? undefined : 'Check your connection and try again. If it keeps happening, the server may be down.'}
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
      ? [
          `${fmtLong(duration - p.currentTime)} left`,
          chapterIdx >= 0 && `Chapter ${chapterIdx + 1} of ${chapters.length}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Not started';
  // Names link to their pages. An author is opened by id; a narrator is only a name, so it travels in the URL.
  const authors = m.authors.length > 0 && (
    <PeopleLinks
      people={m.authors.map((a) => a.name).join(', ')}
      onOpenPerson={(name) => {
        const author = m.authors.find((a) => a.name === name);
        if (author) void navigate(`/author/${encodeURIComponent(author.id)}`);
      }}
    />
  );
  const openNarrator = (name: string) => void navigate(narratorPath(name));
  const heroNarrators = m.narrators.slice(0, NARRATORS_IN_HERO);
  const moreNarrators = m.narrators.length - heroNarrators.length;
  const series = m.series.length > 0 && (
    <>
      {m.series.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && ', '}
          <TitleButton title={s.name} onOpen={() => void navigate(`/series/${encodeURIComponent(s.id)}`)} />
          {s.sequence && ` #${s.sequence}`}
        </Fragment>
      ))}
    </>
  );
  const meta = [m.publishedYear, fmtLong(duration)].filter(Boolean).join(' · ');
  const details: DetailItem[] = bookDetails(item).map((d) =>
    d.label === 'Narrators'
      ? { label: d.label, value: <PeopleLinks people={m.narrators.join(', ')} onOpenPerson={openNarrator} /> }
      : d.label === 'Series' && series
        ? { label: d.label, value: series }
        : d,
  );
  if (authors) details.unshift({ label: m.authors.length > 1 ? 'Authors' : 'Author', value: authors });

  return (
    <main className={styles.page}>
      <BackLink />
      <HeroBand
        art={<Artwork src={coverUrl(item.id, item.updatedAt)} placeholderClassName={styles.ph} lazy={false} />}
        title={m.title}
      >
        {m.subtitle && <p className={styles.sub}>{m.subtitle}</p>}
        {authors && <p className={styles.line}>{authors}</p>}
        {m.narrators.length > 0 && (
          <p className={styles.line}>
            Narrated by <PeopleLinks people={heroNarrators.join(', ')} onOpenPerson={openNarrator} />
            {moreNarrators > 0 && ` and ${moreNarrators} more`}
          </p>
        )}
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

      <div className={styles.body}>
        {details.length > 0 && (
          <section className={styles.side} aria-labelledby="details">
            <h2 id="details" className={styles.heading}>
              Details
            </h2>
            <DetailList className={styles.card} items={details} />
          </section>
        )}
        <div className={styles.main}>
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

          <BookListening item={item} />

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
        </div>
      </div>
    </main>
  );
}
