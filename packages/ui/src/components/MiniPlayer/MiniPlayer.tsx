import { useId } from 'react';
import type { ReactNode } from 'react';
import { ListMusic, Loader2, Maximize2, Play, SkipBack, SkipForward } from 'lucide-react';
import { fmtTime } from '../../lib/fmtTime';
import type { SeekMarker } from '../../lib/seekMarkers';
import { Artwork } from '../Artwork';
import { SeekBar } from '../SeekBar/SeekBar';
import { SkipButton } from '../SkipButton';
import { SleepTimerControl } from '../SleepTimerControl';
import type { SleepChoice, SleepValue } from '../SleepTimerControl';
import { SpeedControl } from '../SpeedControl';
import styles from './MiniPlayer.module.css';

interface Props {
  art?: string;
  /** How the art sits in its square: `cover` crops (default); `contain` shows the whole cover over a blurred copy. */
  artFit?: 'cover' | 'contain';
  title: string;
  /** Under the title: usually the current chapter. */
  subtitle?: string;
  /** A quieter third line on wide containers. */
  author?: string;
  /** Milliseconds. */
  position: number;
  /** Milliseconds; 0 (unknown) draws an empty line. */
  duration: number;
  playing: boolean;
  /** Loading or buffering: the play button shows a spinner and is marked aria-busy. */
  busy?: boolean;
  skipBackSeconds: number;
  /** Label for the skip-forward button; defaults to skipBackSeconds. */
  skipForwardSeconds?: number;
  onSkipBack: () => void;
  /** Wide containers only. Omit to leave the button out. */
  onSkipForward?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onTogglePlay: () => void;
  /** The art and title area is a button that opens the full player. */
  onOpen: () => void;
  /** Makes the top edge a slim seek bar. Omit for a passive progress line. */
  onSeek?: (ms: number) => void;
  /** Chapter starts: ticks (when there is room) and a named hover preview. Only used with onSeek. */
  markers?: SeekMarker[];
  /** Holds the seek preview open at this position (ms) without a pointer. For stories and docs. */
  previewAt?: number;
  /** Playback rate. With onRateChange, a speed control joins the wide layout's right-hand side. */
  rate?: number;
  onRateChange?: (rate: number) => void;
  /** With onSleepChange, a sleep timer control joins the wide layout. */
  sleep?: SleepValue;
  onSleepChange?: (choice: SleepChoice) => void;
  chapterOptionDisabled?: boolean;
  /** Wide layout: a Chapters button. Omit to leave it out. */
  onChapters?: () => void;
  /** Wide layout: an Expand button (the same as the art and title, for those who look for one). */
  onExpand?: () => void;
  /** Replaces the times on the wide layout's right-hand side, e.g. "Stops in 12:30". */
  timeLabel?: string;
  /** A control (e.g. a SegmentedControl for what the bar spans) shown beside the times on the wide layout. */
  modeControl?: ReactNode;
  className?: string;
}

/**
 * A bottom player bar for an app frame. A progress line runs flush along its top edge (a slim seek bar when `onSeek`
 * is given). Phone width: art and title (one button that opens the full player), skip back and play-pause.
 * Wide (72em container): art, title, chapter and author on the left; chapter and skip buttons around play-pause in
 * the centre; times, speed, sleep, chapters and expand on the right. Opaque. Stateless; pads its bottom by the
 * safe-area inset. Sized in em, so put it inside a .page-scale root.
 */
export function MiniPlayer({
  art,
  artFit = 'cover',
  title,
  subtitle,
  author,
  position,
  duration,
  playing,
  busy,
  skipBackSeconds,
  skipForwardSeconds = skipBackSeconds,
  onSkipBack,
  onSkipForward,
  onPrevious,
  onNext,
  onTogglePlay,
  onOpen,
  onSeek,
  markers,
  previewAt,
  rate,
  onRateChange,
  sleep,
  onSleepChange,
  chapterOptionDisabled,
  onChapters,
  onExpand,
  timeLabel,
  modeControl,
  className,
}: Props) {
  const titleId = useId();
  const fraction = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const playLabel = playing ? 'Pause' : 'Play';
  return (
    <section className={[styles.mini, className].filter(Boolean).join(' ')} aria-label="Now playing">
      {onSeek ? (
        <SeekBar
          slim
          className={styles.seek}
          position={position}
          duration={duration}
          onSeek={onSeek}
          markers={markers}
          previewAt={previewAt}
          label={`Progress through ${title}`}
        />
      ) : (
        <div
          className={styles.line}
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuetext={duration > 0 ? `${fmtTime(position)} of ${fmtTime(duration)}` : undefined}
        >
          <div className={styles.fill} style={{ transform: `scaleX(${fraction})` }} />
        </div>
      )}
      <div className={styles.row}>
        <button type="button" className={styles.open} onClick={onOpen} aria-describedby={titleId}>
          <span className={styles.srOnly}>Open player</span>
          <span className={styles.art}>
            <Artwork src={art} fit={artFit} lazy={false} className={styles.img} placeholderClassName={styles.noArt} />
          </span>
          <span className={styles.text} aria-hidden="true">
            <span id={titleId} className={styles.title}>
              {title}
            </span>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
            {author && <span className={`${styles.subtitle} ${styles.author}`}>{author}</span>}
          </span>
        </button>
        <div className={styles.controls} role="group" aria-label="Playback controls">
          <button
            type="button"
            className={`${styles.step} ${styles.wide}`}
            onClick={onPrevious}
            disabled={!onPrevious}
            aria-label="Previous chapter"
            title="Previous chapter"
          >
            <SkipBack size="1.15em" aria-hidden="true" />
          </button>
          <SkipButton direction="back" seconds={skipBackSeconds} onClick={onSkipBack} />
          <button
            type="button"
            className={styles.play}
            onClick={onTogglePlay}
            aria-label={playLabel}
            title={playLabel}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <Loader2 className={styles.spinner} size="1.1em" aria-hidden="true" />
            ) : playing ? (
              <svg width="1em" height="1em" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1" width="4" height="12" rx="1" />
                <rect x="8" y="1" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <Play size="1em" aria-hidden="true" />
            )}
          </button>
          {onSkipForward && (
            <SkipButton
              direction="forward"
              seconds={skipForwardSeconds}
              onClick={onSkipForward}
              className={styles.wide}
            />
          )}
          <button
            type="button"
            className={`${styles.step} ${styles.wide}`}
            onClick={onNext}
            disabled={!onNext}
            aria-label="Next chapter"
            title="Next chapter"
          >
            <SkipForward size="1.15em" aria-hidden="true" />
          </button>
        </div>
        <div className={`${styles.side} ${styles.wide}`}>
          <div className={styles.readout}>
          {modeControl}
          {timeLabel ? (
            <span className={styles.times}>
              <span className={styles.clock}>{timeLabel}</span>
            </span>
          ) : (
            duration > 0 && (
              <span className={styles.times} aria-hidden="true">
                <span className={styles.clock}>
                  {fmtTime(position)} / {fmtTime(duration)}
                </span>
                <span className={styles.left}>−{fmtTime(Math.max(0, duration - position))} left</span>
              </span>
            )
          )}
          </div>
          {rate !== undefined && onRateChange && <SpeedControl value={rate} onChange={onRateChange} />}
          {sleep !== undefined && onSleepChange && (
            <SleepTimerControl
              value={sleep}
              onChange={onSleepChange}
              chapterOptionDisabled={chapterOptionDisabled}
              stableWidth
            />
          )}
          {onChapters && (
            <button type="button" className={styles.step} onClick={onChapters} aria-label="Chapters" title="Chapters">
              <ListMusic size="1.15em" aria-hidden="true" />
            </button>
          )}
          {onExpand && (
            <button type="button" className={styles.step} onClick={onExpand} aria-label="Expand player" title="Expand player">
              <Maximize2 size="1.05em" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
