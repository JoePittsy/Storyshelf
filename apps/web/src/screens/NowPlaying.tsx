import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  Artwork,
  InfoTip,
  ExpandableText,
  ListRow,
  PeopleLinks,
  PillButton,
  PlaybackRemaining,
  PlaybackTime,
  SectionCard,
  SeekBar,
  Select,
  Sheet,
  SkipButton,
  SleepTimerControl,
  SpeedControl,
  TransportButtons,
  useDominantColor,
  useMediaQuery,
} from '@joepittsy/ui';
import { useBook } from '../api/items';
import { narratorPath } from '../api/libraries';
import { usePlayer } from '../player/engine';
import { ProgressModeControl } from '../player/ProgressModeControl';
import { useProgress } from '../player/progressMode';
import { SKIP_OPTIONS } from '../player/settings';
import { ChaptersSheet } from '../player/ChaptersSheet';
import { usePlayerJump } from '../player/useUndoableJump';
import { playerKeyAction } from '../player/shortcuts';
import { fmtClock, sanitiseDescription } from './bookHelpers';
import styles from './NowPlaying.module.css';

const skipOptions = SKIP_OPTIONS.map((n) => ({ value: String(n), label: `${n} seconds` }));

/** Wide enough for two columns and a permanent chapter list; below this it is one column with a Sheet. */
const WIDE = '(width >= 60em)';

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
  // The shortcuts are for a keyboard; a touch screen has nothing to press them with.
  const touch = useMediaQuery('(pointer: coarse)');
  const bar = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<'chapters' | 'settings' | null>(null);
  // The player only knows the author's name; the book (cached from the book page) has their ids.
  const meta = useBook(p.item?.id ?? '').data?.media.metadata;
  const authors = meta?.authors;
  const narrators = meta?.narrators;
  const rawDescription = meta?.description;
  const description = useMemo(() => (rawDescription ? sanitiseDescription(rawDescription) : ''), [rawDescription]);


  // The cover's colour washes the page ground, as on the book page (frame/Frame.module.css reads these).
  const wash = useDominantColor(p.item?.coverUrl ?? null);
  useEffect(() => {
    if (!wash) return;
    const root = document.documentElement.style;
    root.setProperty('--panel-color', wash);
    root.setProperty('--panel-on', '1');
    return () => {
      root.removeProperty('--panel-color');
      root.removeProperty('--panel-on');
    };
  }, [wash]);

  // Toasts sit above the pinned Close bar as well as the mini player (which this screen replaces).
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement.style;
    const set = () => root.setProperty('--toast-lift', getComputedStyle(el).position === 'fixed' ? `${el.offsetHeight}px` : '0px');
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty('--toast-lift');
    };
  }, []);

  const { toggle, skip } = p;
  const { previousChapter, nextChapter } = usePlayerJump();
  const sheetOpen = sheet !== null;
  useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const action = playerKeyAction(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'toggle') toggle();
      else if (action === 'back') skip(-1);
      else if (action === 'forward') skip(1);
      else if (action === 'previousChapter') previousChapter();
      else nextChapter();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen, toggle, skip, previousChapter, nextChapter]);

  const { window: w } = useProgress();
  if (!p.item) return <Navigate to="/" replace />;
  const rel = Math.max(0, p.position - w.start) * 1000;
  const span = (w.end - w.start) * 1000;
  const chapter = p.chapters[p.chapterIndex];
  const hasChapters = p.chapters.length > 0;
  const playing = p.status === 'playing';
  const close = () => void (hasHistory ? navigate(-1) : navigate('/'));

  return (
    <main className={`${styles.page} ${wide && !hasChapters && !description ? styles.solo : ''}`}>
      <div className={styles.bar} ref={bar}>
        <PillButton onClick={close}>Close</PillButton>
        {!touch && (
        <InfoTip label="Keyboard shortcuts">
          <dl className={styles.keys}>
            <dt>Space</dt>
            <dd>Play or pause</dd>
            <dt>Left / Right</dt>
            <dd>Skip back / forward</dd>
            <dt>[ / ]</dt>
            <dd>Previous / next chapter</dd>
          </dl>
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
            {chapter && <p className={styles.chapter}>{chapter.title}</p>}
          </header>

          <div className={styles.controls}>
            <div className={styles.seek}>
              <ProgressModeControl className={styles.mode} />
              <SeekBar
                position={rel}
                duration={span}
                onSeek={(ms) => p.seek(ms / 1000 + w.start)}
                readOnly={!w.seekable}
                valueText={w.label}
                label={`Progress through ${p.item.title}`}
                markers={w.markers}
              />
              <div className={styles.times}>
                {w.label ? (
                  <span>{w.label}</span>
                ) : (
                  <>
                    <PlaybackTime ms={rel} />
                    <PlaybackRemaining position={rel} duration={span} />
                  </>
                )}
              </div>
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
                value={p.sleep?.kind === 'minutes' ? p.sleep : p.sleep ? { kind: 'chapter' } : null}
                onChange={p.setSleep}
                chapterOptionDisabled={!hasChapters}
              />
              <PillButton onClick={() => setSheet('settings')}>Settings</PillButton>
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

      <Sheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Settings" doneLabel="Done">
        <div className={styles.settings}>
          <Select
            label="Skip back"
            value={String(p.skipBack)}
            options={skipOptions}
            onChange={(v) => p.setSkip(Number(v), p.skipForward)}
          />
          <Select
            label="Skip forward"
            value={String(p.skipForward)}
            options={skipOptions}
            onChange={(v) => p.setSkip(p.skipBack, Number(v))}
          />
        </div>
      </Sheet>
    </main>
  );
}
