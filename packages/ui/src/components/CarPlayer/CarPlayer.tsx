import type { ReactNode } from 'react';
import { Moon, RotateCcw, RotateCw, SkipBack, SkipForward, Undo2, X } from 'lucide-react';
import styles from './CarPlayer.module.css';

interface Props {
  /** The current chapter's name; null with no chapters (or between two), and the line is left out. */
  chapter: string | null;
  /** Time left, already formatted ("12:34"), at the current speed. */
  timeLeft: string;
  /** What `timeLeft` counts down to: printed after it ("left in chapter") and part of its spoken name. */
  timeLeftOf: 'chapter' | 'book';
  /**
   * A sleep timer is running: what it says, already formatted ("Stops in 12:30"), the mini player's own wording. Shown
   * as a quiet line under the time left, only while a timer runs. A readout, not a control: car mode has nothing to
   * tap for it. Plain text, not a live region, so a screen reader reads it where it finds it and is not told every second.
   */
  sleepStatus?: string;
  /** 0 to 1 through the chapter (or the book). */
  progress: number;
  playing: boolean;
  /** Loading: Play is disabled and says so. */
  busy?: boolean;
  skipBackSeconds: number;
  skipForwardSeconds: number;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  /** The chapter buttons; leave both out for a book with no chapters and the row goes. */
  onPreviousChapter?: () => void;
  onNextChapter?: () => void;
  nextDisabled?: boolean;
  onClose: () => void;
  /** Named "Close car mode" by default. */
  closeLabel?: string;
  /** A way back after a chapter jump: a big button opposite Close while it is offered. */
  undo?: { label: string; onUndo: () => void } | null;
  /** Something to say at the top in place of the chapter, such as a load failure. */
  notice?: ReactNode;
  className?: string;
}

/**
 * A full-screen player for the car or a walk: glanceable, one-handed, almost no words. The chapter and the time left in
 * it, a thick progress bar, then the controls as big, well-spaced targets (64px and up; Play far bigger) so a mis-tap
 * lands on nothing rather than a neighbour. A running sleep timer is a one-line readout under the time left (never a
 * control). Stateless: the app owns playback and passes values in. It fills its
 * container; sizes follow the smaller side of the viewport, and it lays out in two columns in landscape.
 */
export function CarPlayer({
  chapter,
  timeLeft,
  timeLeftOf,
  sleepStatus,
  progress,
  playing,
  busy = false,
  skipBackSeconds,
  skipForwardSeconds,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onPreviousChapter,
  onNextChapter,
  nextDisabled = false,
  onClose,
  closeLabel = 'Close car mode',
  undo,
  notice,
  className,
}: Props) {
  const fraction = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const percent = Math.round(fraction * 100);
  const of = timeLeftOf === 'chapter' ? 'in chapter' : 'in book';
  const playLabel = busy ? 'Loading' : playing ? 'Pause' : 'Play';
  const secs = (n: number) => `${n} ${n === 1 ? 'second' : 'seconds'}`;
  return (
    <div className={[styles.car, className].filter(Boolean).join(' ')}>
      <div className={styles.top}>
        <button
          type="button"
          className={`${styles.btn} ${styles.close}`}
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <X className={styles.icon} aria-hidden="true" />
        </button>
        {undo && (
          <button type="button" className={`${styles.btn} ${styles.undo}`} onClick={undo.onUndo} aria-keyshortcuts="U">
            <Undo2 className={styles.icon} aria-hidden="true" />
            <span className={styles.undoText}>{undo.label}</span>
          </button>
        )}
      </div>

      <div className={styles.info}>
        {notice ? <p className={styles.chapter}>{notice}</p> : chapter && <p className={styles.chapter}>{chapter}</p>}
        <p className={styles.time} aria-label={`${timeLeft} left ${of}`}>
          <span className={styles.clock}>{timeLeft}</span>
          <span className={styles.of} aria-hidden="true">
            left {of}
          </span>
        </p>
        {sleepStatus && (
          <p className={styles.sleep}>
            <Moon className={styles.moon} aria-hidden="true" />
            {sleepStatus}
          </p>
        )}
        <div
          className={styles.track}
          role="progressbar"
          aria-label={`Progress through the ${timeLeftOf}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.fill} style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>

      <div className={styles.controls} role="group" aria-label="Playback controls">
        {(onPreviousChapter || onNextChapter) && (
          <div className={styles.chapters}>
            <button
              type="button"
              className={`${styles.btn} ${styles.wide}`}
              onClick={onPreviousChapter}
              disabled={!onPreviousChapter}
              aria-label="Previous chapter"
              title="Previous chapter"
            >
              <SkipBack className={styles.icon} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.wide}`}
              onClick={onNextChapter}
              disabled={!onNextChapter || nextDisabled}
              aria-label="Next chapter"
              title="Next chapter"
            >
              <SkipForward className={styles.icon} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={styles.transport}>
          <button
            type="button"
            className={`${styles.btn} ${styles.skip}`}
            onClick={onSkipBack}
            aria-label={`Back ${secs(skipBackSeconds)}`}
            title={`Back ${secs(skipBackSeconds)}`}
          >
            <RotateCcw className={styles.ring} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.seconds} aria-hidden="true">
              {skipBackSeconds}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.play}`}
            onClick={onPlayPause}
            disabled={busy}
            aria-busy={busy || undefined}
            aria-label={playLabel}
            title={playLabel}
          >
            {playing ? (
              <svg className={styles.glyph} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1" width="4" height="12" rx="1" />
                <rect x="8" y="1" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg
                className={`${styles.glyph} ${styles.playGlyph}`}
                viewBox="0 0 14 14"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M3 1.8v10.4a.8.8 0 0 0 1.2.7l8.6-5.2a.8.8 0 0 0 0-1.4L4.2 1.1A.8.8 0 0 0 3 1.8Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.skip}`}
            onClick={onSkipForward}
            aria-label={`Forward ${secs(skipForwardSeconds)}`}
            title={`Forward ${secs(skipForwardSeconds)}`}
          >
            <RotateCw className={styles.ring} strokeWidth={1.5} aria-hidden="true" />
            <span className={styles.seconds} aria-hidden="true">
              {skipForwardSeconds}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
