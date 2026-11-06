import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import {
  Artwork,
  ListRow,
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
import { chapterMarkers } from '../player/chapters';
import { usePlayer } from '../player/engine';
import { SKIP_OPTIONS } from '../player/settings';
import { fmtClock } from './bookHelpers';
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

  if (!p.item) return <Navigate to="/" replace />;
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
        <SeekBar
          position={p.position * 1000}
          duration={p.duration * 1000}
          onSeek={(ms) => p.seek(ms / 1000)}
          label={`Progress through ${p.item.title}`}
          markers={chapterMarkers(p.chapters)}
        />
        <div className={styles.times}>
          <PlaybackTime ms={p.position * 1000} />
          <PlaybackRemaining position={p.position * 1000} duration={p.duration * 1000} />
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

      <Sheet open={sheet === 'chapters'} onClose={() => setSheet(null)} title="Chapters">
        <ul className={styles.chapters}>
          {p.chapters.map((c, i) => (
            <ListRow
              key={c.id}
              title={c.title}
              aside={fmtClock(c.start)}
              current={i === p.chapterIndex}
              onClick={() => {
                p.seek(c.start);
                setSheet(null);
              }}
            />
          ))}
        </ul>
      </Sheet>

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
