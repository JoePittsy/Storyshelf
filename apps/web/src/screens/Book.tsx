import { Fragment, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Artwork,
  DetailList,
  EmptyState,
  ExpandableText,
  SectionCard,
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
  bookProgress,
  fmtClock,
  fmtLong,
  playFrom,
  playLabel,
  sanitiseDescription,
} from './bookHelpers';
import { usePanelColor } from '../frame/usePanelColor';
import { usePlayer } from '../player/engine';
import { BackLink } from '../components/BackLink';
import { useCoverDock } from './useCoverDock';
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
  const player = usePlayer();
  const { data: item, error, isPending, refetch } = useBook(id);
  const [pageEl, setPageEl] = useState<HTMLElement | null>(null);
  const [coverEl, setCoverEl] = useState<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const cover = item ? coverUrl(item.id, item.updatedAt) : null;
  const wash = usePanelColor(cover);
  const slotRef = useRef<HTMLDivElement>(null);
  useCoverDock(pageEl, coverEl, dockRef, slotRef, cover);
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
  // The book in the player moves under us: its position, chapter and progress are the player's, not the last fetch.
  const now = bookProgress(item, player);
  const chapterIdx = now.chapterIndex;
  const started = now.currentTime > 0 && !now.isFinished;
  // The button resumes from where the player is, not from the last fetch.
  const resume = now.live ? { currentTime: now.currentTime, isFinished: now.isFinished } : p;
  const label = playLabel(resume);

  const status = now.isFinished
    ? 'Finished'
    : started
      ? [
          `${fmtLong(duration - now.currentTime)} left`,
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
        : d
  );
  if (authors) details.unshift({ label: m.authors.length > 1 ? 'Authors' : 'Author', value: authors });

  return (
    <main className={styles.page} ref={setPageEl}>
      <BackLink />
      <HeroBand
        art={
          // useCoverDock hides it (visibility, so the hero keeps its space) while the cover is docked or warping.
          <div ref={setCoverEl} className={styles.hero}>
            <Artwork src={cover} fit="contain" placeholderClassName={styles.ph} lazy={false} />
          </div>
        }
        title={m.title}
        wash={wash}
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
          <ProgressBar value={now.isFinished ? 1 : now.progress} label={`Progress through ${m.title}`} />
          <p className={styles.line}>{status}</p>
        </div>
        <PillButton variant="primary" className={styles.action} onClick={() => onPlay(playFrom(resume))}>
          {label}
        </PillButton>
      </HeroBand>

      <div className={styles.body}>
        {details.length > 0 && (
          <SectionCard className={styles.side} title="Details">
            {/* Wide only. The slot's height grows with the dock progress; the frame inside is always full size. */}
            <div className={styles.slot} ref={slotRef}>
              <div className={styles.docked} aria-hidden="true" ref={dockRef} style={{ visibility: 'hidden' }}>
                <Artwork src={cover} fit="contain" placeholderClassName={styles.ph} lazy={false} />
              </div>
            </div>
            <DetailList items={details} />
          </SectionCard>
        )}
        <div className={styles.main}>
          {description && (
            <SectionCard title="About this book">
              <ExpandableText>
                <div dangerouslySetInnerHTML={{ __html: description }} />
              </ExpandableText>
            </SectionCard>
          )}

          <BookListening item={item} />

          {chapters.length > 0 && (
            <SectionCard title="Chapters">
              <ul className={styles.chapters}>
                {chapters.map((c, i) => (
                  <ListRow
                    key={c.id}
                    lead={i + 1}
                    title={c.title}
                    aside={fmtClock(c.start)}
                    trailing={fmtClock(c.end - c.start, false)}
                    current={i === chapterIdx}
                    onClick={() => onChapter(c.start)}
                  />
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </main>
  );
}
