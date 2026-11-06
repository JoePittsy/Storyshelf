import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  Artwork,
  GrabSheet,
  IconTray,
  InfoTip,
  ExpandableText,
  ListRow,
  PeopleLinks,
  PillButton,
  PlaybackRemaining,
  PlaybackTime,
  SectionCard,
  SeekBar,
  SkipButton,
  SleepTimerControl,
  SpeedControl,
  StepperRow,
  TrayButton,
  TransportButtons,
  useDominantColor,
  useMediaQuery,
} from '@joepittsy/ui';
import { useBook } from '../api/items';
import { narratorPath } from '../api/libraries';
import { usePlayer } from '../player/engine';
import { ProgressModeControl } from '../player/ProgressModeControl';
import { ProgressModeTabs } from '../player/ProgressModeTabs';
import { chapterRowText } from '../player/chapterRow';
import { ModeAnnouncer } from '../player/ModeAnnouncer';
import { useModeTap, useProgress } from '../player/progressMode';
import { ChaptersSheet } from '../player/ChaptersSheet';
import { HistorySheet } from '../player/HistorySheet';
import { usePlayerJump } from '../player/useUndoableJump';
import { useRestoreSettled } from '../player/restoreStatus';
import { ShortcutList } from '../frame/ShortcutList';
import { fmtClock, sanitiseDescription } from './bookHelpers';
import styles from './NowPlaying.module.css';

/** Wide enough for two columns and a permanent chapter list; below this it is one column with a Sheet. */
const WIDE = '(width >= 60em)';
/** A phone: the player is a full-height sheet you can pull down. The same breakpoint the ui components use for touch sizing. */
const PHONE = '(width < 40em)';

/**
 * The chapter list for wide screens, a column as tall as the chapters, so the page scrolls it (the player beside it
 * stays put). The current chapter is brought into view when the screen opens, and again as the book moves on.
 */
function ChapterList() {
  const p = usePlayer();
  const { jumpTo } = usePlayerJump();
  const box = useRef<HTMLUListElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>('[aria-current="true"]')?.parentElement;
    if (!row) return;
    const wasFirst = first.current;
    first.current = false;
    const r = row.getBoundingClientRect();
    const visible = r.top >= 0 && r.bottom <= window.innerHeight;
    if (visible) return;
    // Opening the screen centres the chapter you are in; afterwards the page only moves as far as it must.
    row.scrollIntoView({ block: wasFirst ? 'center' : 'nearest', behavior: wasFirst ? 'auto' : 'smooth' });
  }, [p.chapterIndex]);
  return (
    <SectionCard title="Chapters" sub={`${p.chapters.length} chapters`} className={styles.side}>
      <ul ref={box} className={styles.chapterList}>
        {p.chapters.map((c, i) => (
          <ListRow
            key={c.id}
            // The number is a column of its own: hidden from assistive tech so a name isn't read as "101 - …".
            lead={<span aria-hidden="true">{i + 1}</span>}
            title={c.title}
            aside={fmtClock(c.start)}
            trailing={fmtClock(c.end - c.start, false)}
            current={i === p.chapterIndex}
            onClick={() => jumpTo(c.start, `Chapter ${i + 1}`)}
          />
        ))}
      </ul>
    </SectionCard>
  );
}

/** The full-screen player, a route inside the frame so the browser's back button closes it. */
export function NowPlaying() {
  const p = usePlayer();
  const navigate = useNavigate();
  const hasHistory = useLocation().key !== 'default';
  const wide = useMediaQuery(WIDE);
  const phone = useMediaQuery(PHONE);
  // The shortcuts are for a keyboard; a touch screen has nothing to press them with.
  const touch = useMediaQuery('(pointer: coarse), (hover: none)');
  const restoreSettled = useRestoreSettled();
  const bar = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<'chapters' | 'history' | null>(null);
  // The player only knows the author's name; the book (cached from the book page) has their ids.
  const meta = useBook(p.item?.id ?? '').data?.media.metadata;
  const authors = meta?.authors;
  const narrators = meta?.narrators;
  const rawDescription = meta?.description;
  const description = useMemo(() => (rawDescription ? sanitiseDescription(rawDescription) : ''), [rawDescription]);


  // The cover's colour washes the page ground, as on the book page (frame/Frame.module.css reads these).
  const wash = useDominantColor(p.item?.coverUrl ?? null);
  useEffect(() => {
    // On a phone the sheet paints its own wash (one even fade down from the top edge), so the page ground stays plain.
    if (!wash || phone) return;
    const root = document.documentElement.style;
    root.setProperty('--panel-color', wash);
    root.setProperty('--panel-on', '1');
    return () => {
      root.removeProperty('--panel-color');
      root.removeProperty('--panel-on');
    };
  }, [wash, phone]);

  // Toasts sit above whatever is pinned to the bottom edge: the Close bar on a wide page, and on a phone the whole control
  // stack (so the Undo toast covers the cover art and title, never the chapter row or Play).
  useEffect(() => {
    const el = phone ? controls.current : bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement.style;
    const set = () => {
      // offsetTop, not the bounding box: the sheet is still sliding in (a transform) when this first runs.
      if (phone) root.setProperty('--toast-lift', `${Math.max(0, window.innerHeight - el.offsetTop)}px`);
      else root.setProperty('--toast-lift', getComputedStyle(el).position === 'fixed' ? `${el.offsetHeight}px` : '0px');
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener('resize', set);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', set);
      root.removeProperty('--toast-lift');
    };
  }, [phone]);

  const { previousChapter, nextChapter } = usePlayerJump();

  const { window: w } = useProgress();
  const { flash, onTap } = useModeTap();
  if (!p.item) {
    // A reload lands here before the last book has been put back: wait for that to settle, then go only if there is nothing to show.
    if (!restoreSettled)
      return (
        <main className={styles.page} aria-busy="true">
          <div className={styles.player} role="status" aria-label="Loading">
            <div className={`skeleton ${styles.art}`} />
            <div className={`skeleton ${styles.skeletonTitle}`} />
            <div className={`skeleton ${styles.skeletonControls}`} />
          </div>
        </main>
      );
    return <Navigate to="/" replace />;
  }
  const rel = Math.max(0, p.position - w.start) * 1000;
  const span = (w.end - w.start) * 1000;
  const chapter = p.chapters[p.chapterIndex];
  const hasChapters = p.chapters.length > 0;
  const playing = p.status === 'playing';
  const close = () => void (hasHistory ? navigate(-1) : navigate('/'));
  const done = p.duration > 0 ? Math.min(100, Math.floor((p.position / p.duration) * 100)) : null;
  const row = chapter ? chapterRowText(chapter.title, p.chapterIndex, p.chapters.length) : null;

  const seekBar = (
    <SeekBar
      position={rel}
      duration={span}
      onSeek={(ms) => p.seek(ms / 1000 + w.start)}
      readOnly={!w.seekable}
      valueText={w.label}
      label={`Progress through ${p.item.title}`}
      markers={w.markers}
      onTap={onTap}
      flash={flash}
      thumb={phone}
    />
  );
  // Position on the left, what is left on the right: both clocks, in the current mode's window.
  const times = (
    <div className={styles.times}>
      {w.label ? (
        <span>{w.label}</span>
      ) : (
        <>
          <PlaybackTime ms={rel} />
          <PlaybackRemaining position={rel} duration={span} format="clock" />
        </>
      )}
    </div>
  );
  const sleepValue = p.sleep?.kind === 'minutes' ? p.sleep : p.sleep ? ({ kind: 'chapter' } as const) : null;
  const historySheet = <HistorySheet open={sheet === 'history'} onClose={() => setSheet(null)} />;

  if (phone)
    return (
      <main className={styles.sheetRoot} style={wash ? ({ '--wash': wash } as CSSProperties) : undefined}>
        <GrabSheet onDismiss={close} closeLabel="Close player" className={styles.sheet}>
          <div className={styles.phoneArt}>
            <div className={styles.cover}>
              <Artwork src={p.item.coverUrl} fit="contain" lazy={false} placeholderClassName={styles.ph} />
              {done !== null && (
                <span className={styles.badge} role="img" aria-label={`${done}% listened`}>
                  {done}%
                </span>
              )}
            </div>
          </div>

          <header className={styles.phoneHead}>
            <h1 className={styles.phoneTitle}>{p.item.title}</h1>
            <p className={styles.byline}>
              <span className={styles.author}>
                {authors?.length ? (
                  <PeopleLinks
                    people={authors.map((a) => a.name).join(', ')}
                    onOpenPerson={(name) => {
                      const a = authors.find((x) => x.name === name);
                      if (a) void navigate(`/author/${encodeURIComponent(a.id)}`);
                    }}
                  />
                ) : (
                  p.item.author
                )}
              </span>
              {/* Wraps onto a second line, and is clipped, unless it fits beside the author. */}
              {!!narrators?.length && <span className={styles.narrator}>Narrated by {narrators.join(', ')}</span>}
            </p>
          </header>

          <div className={styles.phoneControls} ref={controls}>
            <ProgressModeTabs className={styles.tabs} />
            {row && (
              <StepperRow
                title={row.title}
                count={row.count ?? undefined}
                hint={row.hint}
                onOpen={() => setSheet('chapters')}
                onPrevious={previousChapter}
                onNext={nextChapter}
                previousLabel="Previous chapter"
                nextLabel="Next chapter"
                nextDisabled={p.chapterIndex >= p.chapters.length - 1}
              />
            )}
            <div className={styles.seek}>
              {seekBar}
              <ModeAnnouncer text={flash} />
              {times}
            </div>
            <TransportButtons
              size="xl"
              ends={false}
              className={styles.transport}
              playing={playing}
              onPlayPause={p.toggle}
              disabled={p.status === 'loading'}
              beforePlay={<SkipButton direction="back" size="lg" seconds={p.skipBack} onClick={() => p.skip(-1)} />}
              afterPlay={<SkipButton direction="forward" size="lg" seconds={p.skipForward} onClick={() => p.skip(1)} />}
            />
            <IconTray label="Player options">
              <SpeedControl value={p.rate} onChange={p.setRate} fixedDecimal />
              <SleepTimerControl value={sleepValue} onChange={p.setSleep} chapterOptionDisabled={!hasChapters} compact />
              {hasChapters && <TrayButton icon="chapters" label="Chapters" onClick={() => setSheet('chapters')} />}
              <TrayButton icon="history" label="History" onClick={() => setSheet('history')} />
            </IconTray>
          </div>
        </GrabSheet>
        <ChaptersSheet open={sheet === 'chapters'} onClose={() => setSheet(null)} />
        {historySheet}
      </main>
    );

  return (
    <main className={`${styles.page} ${wide && !hasChapters && !description ? styles.solo : ''}`}>
      <div className={styles.bar} ref={bar}>
        <PillButton onClick={close}>Close</PillButton>
        {!touch && (
        <InfoTip label="Keyboard shortcuts">
          <ShortcutList />
        </InfoTip>
        )}
      </div>

      <div className={styles.player}>
        <div className={styles.art}>
          <Artwork src={p.item.coverUrl} fit="contain" lazy={false} placeholderClassName={styles.ph} />
        </div>

        <div className={styles.info}>
          <header className={styles.head}>
            <h1 className={styles.title}>{p.item.title}</h1>
            <p className={styles.line}>
              {authors?.length ? (
                <PeopleLinks
                  people={authors.map((a) => a.name).join(', ')}
                  onOpenPerson={(name) => {
                    const a = authors.find((x) => x.name === name);
                    if (a) void navigate(`/author/${encodeURIComponent(a.id)}`);
                  }}
                />
              ) : (
                p.item.author
              )}
            </p>
            {!!narrators?.length && (
              <p className={styles.line}>
                Narrated by{' '}
                <PeopleLinks people={narrators.join(', ')} onOpenPerson={(name) => void navigate(narratorPath(name))} />
              </p>
            )}
            {chapter && (
              <p className={styles.chapter}>
                <span className={styles.chapterCount}>
                  Chapter {p.chapterIndex + 1} of {p.chapters.length}
                </span>
                {chapter.title}
              </p>
            )}
          </header>

          <div className={styles.controls}>
            <div className={styles.seek}>
              {/* Touch and narrow: a tap on the bar steps through the modes; this stays for a screen reader and keyboard. */}
              <ProgressModeControl className={`${styles.mode} ${styles.modeControl}`} />
              {seekBar}
              <ModeAnnouncer text={flash} />
              {times}
            </div>

            <TransportButtons
              size="lg"
              className={styles.transport}
              playing={playing}
              onPlayPause={p.toggle}
              onPrevious={previousChapter}
              onNext={nextChapter}
              previousDisabled={!hasChapters}
              nextDisabled={!hasChapters}
              previousLabel="Previous chapter"
              nextLabel="Next chapter"
              disabled={p.status === 'loading'}
              beforePlay={<SkipButton direction="back" seconds={p.skipBack} onClick={() => p.skip(-1)} />}
              afterPlay={<SkipButton direction="forward" seconds={p.skipForward} onClick={() => p.skip(1)} />}
            />

            <div className={styles.options}>
              <SpeedControl value={p.rate} onChange={p.setRate} />
              <SleepTimerControl
                value={sleepValue}
                onChange={p.setSleep}
                chapterOptionDisabled={!hasChapters}
              />
              <PillButton onClick={() => setSheet('history')}>History</PillButton>
              {hasChapters && !wide && <PillButton onClick={() => setSheet('chapters')}>Chapters</PillButton>}
            </div>
          </div>
        </div>
      </div>

      {hasChapters && wide && <ChapterList />}
      {/* A book without chapters has nothing for the second column but its description. */}
      {!hasChapters && wide && description && (
        <SectionCard title="About this book" className={styles.side}>
          <ExpandableText lines={14}>
            <div dangerouslySetInnerHTML={{ __html: description }} />
          </ExpandableText>
        </SectionCard>
      )}
      {!wide && <ChaptersSheet open={sheet === 'chapters'} onClose={() => setSheet(null)} />}

      {historySheet}
    </main>
  );
}
