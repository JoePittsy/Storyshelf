import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  Artwork,
  PeopleLinks,
  PillButton,
  PlaybackRemaining,
  PlaybackTime,
  SeekBar,
  Select,
  Sheet,
  SkipButton,
  SleepTimerControl,
  SpeedControl,
  TransportButtons,
} from '@joepittsy/ui';
import { useBook } from '../api/items';
import { usePlayer } from '../player/engine';
import { ProgressModeControl } from '../player/ProgressModeControl';
import { useProgress } from '../player/progressMode';
import { SKIP_OPTIONS } from '../player/settings';
import { ChaptersSheet } from '../player/ChaptersSheet';
import styles from './NowPlaying.module.css';

const skipOptions = SKIP_OPTIONS.map((n) => ({ value: String(n), label: `${n} seconds` }));

/** The full-screen player, a route inside the frame so the browser's back button closes it. */
export function NowPlaying() {
  const p = usePlayer();
  const navigate = useNavigate();
  const hasHistory = useLocation().key !== 'default';
  const [sheet, setSheet] = useState<'chapters' | 'settings' | null>(null);
  // The player only knows the author's name; the book (cached from the book page) has their ids.
  const authors = useBook(p.item?.id ?? '').data?.media.metadata.authors;

  const { window: w } = useProgress();
  if (!p.item) return <Navigate to="/" replace />;
  const rel = Math.max(0, p.position - w.start) * 1000;
  const span = (w.end - w.start) * 1000;
  const chapter = p.chapters[p.chapterIndex];
  const playing = p.status === 'playing';
  const close = () => void (hasHistory ? navigate(-1) : navigate('/'));

  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <PillButton onClick={close}>Close</PillButton>
        <PillButton onClick={() => setSheet('settings')}>Settings</PillButton>
      </div>
      <div className={styles.art}>
        <Artwork src={p.item.coverUrl} lazy={false} placeholderClassName={styles.ph} />
      </div>
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
      {chapter && <p className={styles.line}>{chapter.title}</p>}

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

      <div className={styles.transport}>
        <SkipButton direction="back" seconds={p.skipBack} size="lg" onClick={() => p.skip(-1)} />
        <TransportButtons
          playing={playing}
          onPlayPause={p.toggle}
          onPrevious={p.previousChapter}
          onNext={p.nextChapter}
          disabled={p.status === 'loading'}
        />
        <SkipButton direction="forward" seconds={p.skipForward} size="lg" onClick={() => p.skip(1)} />
      </div>

      <div className={styles.options}>
        <SpeedControl value={p.rate} onChange={p.setRate} />
        <SleepTimerControl
          value={p.sleep?.kind === 'minutes' ? p.sleep : p.sleep ? { kind: 'chapter' } : null}
          onChange={p.setSleep}
          chapterOptionDisabled={p.chapters.length === 0}
        />
        {p.chapters.length > 0 && <PillButton onClick={() => setSheet('chapters')}>Chapters</PillButton>}
      </div>

      <ChaptersSheet open={sheet === 'chapters'} onClose={() => setSheet(null)} />

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
