import { SkipBack, Play, SkipForward } from 'lucide-react';
import styles from './TransportButtons.module.css';

interface Props {
  /** Whether it is playing now: the middle button shows Pause, otherwise Play. */
  playing: boolean;
  onPlayPause: () => void;
  /** A button with no handler is disabled. */
  onPrevious?: () => void;
  onNext?: () => void;
  /** Disables all three (nothing loaded, not signed in). */
  disabled?: boolean;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  /** Solid glyphs instead of outlines. */
  filled?: boolean;
  className?: string;
}

/** Previous / play-pause / next. Stateless: the caller owns playback and passes what it is doing. Sized in em. */
export function TransportButtons({
  playing,
  onPlayPause,
  onPrevious,
  onNext,
  disabled = false,
  previousDisabled = false,
  nextDisabled = false,
  filled,
  className,
}: Props) {
  const fill = filled ? 'currentColor' : undefined;
  const playLabel = playing ? 'Pause' : 'Play';
  return (
    <div
      className={[styles.transport, className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Playback controls"
    >
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || previousDisabled || !onPrevious}
        onClick={onPrevious}
        title="Previous"
        aria-label="Previous"
      >
        <SkipBack size="1.15em" fill={fill} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.play}`}
        disabled={disabled}
        onClick={onPlayPause}
        title={playLabel}
        aria-label={playLabel}
      >
        {playing ? (
          <svg width="1em" height="1em" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <rect x="2" y="1" width="4" height="12" rx="1" />
            <rect x="8" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <Play size="1em" fill={fill} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || nextDisabled || !onNext}
        onClick={onNext}
        title="Next"
        aria-label="Next"
      >
        <SkipForward size="1.15em" fill={fill} aria-hidden="true" />
      </button>
    </div>
  );
}
