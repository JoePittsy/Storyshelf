import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  Artwork,
  InfoTip,
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
import { playerKeyAction } from '../player/shortcuts';
import { fmtClock } from './bookHelpers';
import styles from './NowPlaying.module.css';

const skipOptions = SKIP_OPTIONS.map((n) => ({ value: String(n), label: `${n} seconds` }));

/** Wide enough for two columns and a permanent chapter list; below this it is one column with a Sheet. */
const WIDE = '(width >= 60em)';

/** The chapter list for wide screens: the current chapter is highlighted and kept in view as the book plays. */
function ChapterList() {
  const p = usePlayer();
  const box = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = box.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="true"]')?.parentElement;
    if (!list || !row) return;
    // Scroll the list itself, never the page.
    const top = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, top) });
  }, [p.chapterIndex]);
  return (
    <SectionCard title="Chapters" sub={`${p.chapters.length} chapters`} className={styles.chapterCard}>
      <ul ref={box} className={styles.chapterList}>
        {p.chapters.map((c, i) => (
          <ListRow
            key={c.id}
            lead={i + 1}
            title={c.title}
            aside={fmtClock(c.start)}
            current={i === p.chapterIndex}
            onClick={() => p.seek(c.start)}
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
  const [sheet, setSheet] = useState<'chapters' | 'settings' | null>(null);
  // The player only knows the author's name; the book (cached from the book page) has their ids.
  const meta = useBook(p.item?.id ?? '').data?.media.metadata;
  const authors = meta?.authors;
  const narrators = meta?.narrators;

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

  const { toggle, skip, previousChapter, nextChapter } = p;
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
    <main className={styles.page}>
      <div className={styles.bar}>
        <PillButton onClick={close}>Close</PillButton>
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
      </div>

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
          onPrevious={p.previousChapter}
          onNext={p.nextChapter}
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

      {hasChapters && wide && <ChapterList />}
      {!wide && <ChaptersSheet open={sheet === 'chapters'} onClose={() => setSheet(null)} />}

      <Sheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Settings">
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
