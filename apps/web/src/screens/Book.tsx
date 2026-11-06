import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Artwork,
  DetailList,
  EmptyState,
  ExpandableText,
  fmtLeft,
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
  descriptionSource,
  fmtClock,
  fmtLong,
  playFrom,
  playLabel,
  sanitiseDescription,
} from './bookHelpers';
import { usePanelColor } from '../frame/usePanelColor';
import { usePlayer } from '../player/engine';
import { useUndoableJump } from '../player/useUndoableJump';
import { useDocumentTitle } from '../frame/useDocumentTitle';
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
  const cover = item ? coverUrl(item.id, item.updatedAt) : null;
  const wash = usePanelColor(cover);
  useCoverDock(pageEl, coverEl);
  const description = useMemo(() => {
    const raw = item?.media.metadata.description;
    // A description that is only a link reads as a source, not as a wall of address.
    return raw && !descriptionSource(raw) ? sanitiseDescription(raw) : '';
  }, [item]);
  const source = useMemo(() => {
    const raw = item?.media.metadata.description;
    return raw ? descriptionSource(raw) : null;
  }, [item]);
  const jump = useUndoableJump(onChapter);
  useDocumentTitle(item?.media.metadata.title);

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
  // While this book is the one playing, the primary action pauses it rather than offering a no-op "Resume".
  const playingHere = player.item?.id === item.id && player.status === 'playing';
  // The action says what it will do and how much book is left, so one tap is enough to decide.
  const left = duration > 0 && !now.isFinished && started ? fmtLeft((duration - now.currentTime) * 1000) : '';
  const label = playingHere ? 'Pause' : [playLabel(resume), left].filter(Boolean).join(' · ');

  const status = now.isFinished
    ? 'Finished'
    : started
      ? [
          // Always the chapter first, then the time left: the button carries the time left, except while it reads Pause.
          chapterIdx >= 0 && `Chapter ${chapterIdx + 1} of ${chapters.length}`,
          (playingHere || chapterIdx < 0) && fmtLeft((duration - now.currentTime) * 1000),
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
  const meta = [m.publishedYear, duration > 0 && `${fmtLong(duration)} long`].filter(Boolean).join(' · ');
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
          // useCoverDock's --dock-t minimises and fades it on the wide layout; it keeps its space in the hero.
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
        <PillButton variant="primary" className={styles.action} onClick={() => (playingHere ? player.toggle() : onPlay(playFrom(resume)))}>
          {label}
        </PillButton>
      </HeroBand>

      <div className={styles.body}>
        {/* Reading order is the visual order: the chapters straight after the hero, then about, listening and details. */}
        <div className={styles.main}>
          {chapters.length > 0 && (
            <SectionCard title="Chapters">
              <ul className={styles.chapters}>
                {chapters.map((c, i) => (
                  <ListRow
                    key={c.id}
                    // The number is a column of its own: hidden from assistive tech so a name isn't read as "101 - …".
                    lead={<span aria-hidden="true">{i + 1}</span>}
                    title={c.title}
                    aside={fmtClock(c.start)}
                    asideWideOnly
                    trailing={fmtClock(c.end - c.start, false)}
                    current={i === chapterIdx}
                    onClick={() => jump(c.start, `Chapter ${i + 1}`, started ? now.currentTime : null)}
                  />
                ))}
              </ul>
            </SectionCard>
          )}

          {description && (
            <SectionCard title="About this book">
              <ExpandableText>
                <div dangerouslySetInnerHTML={{ __html: description }} />
              </ExpandableText>
            </SectionCard>
          )}
          {source && (
            <p className={styles.source}>
              Source:{' '}
              <a href={source.href} target="_blank" rel="noopener noreferrer">
                {source.host}
              </a>
            </p>
          )}

          <BookListening item={item} />
        </div>
        {details.length > 0 && (
          <SectionCard className={styles.side} title="Details">
            {/* Wide only. The slot's height grows with the dock progress; the frame inside is always full size. */}
            <div className={styles.slot}>
              <div className={styles.docked} aria-hidden="true">
                <Artwork src={cover} fit="contain" placeholderClassName={styles.ph} lazy={false} />
              </div>
            </div>
            <DetailList items={details} />
          </SectionCard>
        )}
      </div>
    </main>
  );
}
