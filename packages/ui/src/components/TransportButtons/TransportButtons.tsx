import type { ReactNode } from 'react';
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
  /** `lg` scales the whole row up for a full-screen player. */
  size?: 'md' | 'lg';
  /** Accessible names for the outer buttons; "Previous" and "Next" by default. */
  previousLabel?: string;
  nextLabel?: string;
  /** Extra controls between Previous and Play, and between Play and Next (e.g. skip back / forward). */
  beforePlay?: ReactNode;
  afterPlay?: ReactNode;
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
  size = 'md',
  previousLabel = 'Previous',
  nextLabel = 'Next',
  beforePlay,
  afterPlay,
  className,
}: Props) {
  const fill = filled ? 'currentColor' : undefined;
  const playLabel = playing ? 'Pause' : 'Play';
  return (
    <div
      className={[styles.transport, size === 'lg' ? styles.lg : '', className].filter(Boolean).join(' ')}
      role="group"
      aria-label="Playback controls"
    >
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || previousDisabled || !onPrevious}
        onClick={onPrevious}
        title={previousLabel}
        aria-label={previousLabel}
      >
        <SkipBack size="1.15em" fill={fill} aria-hidden="true" />
      </button>
      {beforePlay}
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
      {afterPlay}
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || nextDisabled || !onNext}
        onClick={onNext}
        title={nextLabel}
        aria-label={nextLabel}
      >
        <SkipForward size="1.15em" fill={fill} aria-hidden="true" />
      </button>
    </div>
  );
}
