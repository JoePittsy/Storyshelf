import { useId } from 'react';
import { Loader2, Play } from 'lucide-react';
import { fmtTime } from '../../lib/fmtTime';
import type { SeekMarker } from '../../lib/seekMarkers';
import { Artwork } from '../Artwork';
import { PlaybackRemaining, PlaybackTime } from '../SeekBar/PlaybackTime';
import { SeekBar } from '../SeekBar/SeekBar';
import { SkipButton } from '../SkipButton';
import styles from './MiniPlayer.module.css';

interface Props {
  art?: string;
  title: string;
  subtitle?: string;
  /** Milliseconds. */
  position: number;
  /** Milliseconds; 0 (unknown) draws an empty line. */
  duration: number;
  playing: boolean;
  /** Loading or buffering: the play button shows a spinner and is marked aria-busy. */
  busy?: boolean;
  skipBackSeconds: number;
  onSkipBack: () => void;
  onTogglePlay: () => void;
  /** The art and title area is a button that opens the full player. */
  onOpen: () => void;
  /** Makes the top line a slim seek bar (and, on wide containers, shows elapsed and remaining time). Omit for a passive line. */
  onSeek?: (ms: number) => void;
  /** Chapter starts: ticks on the bar and a named hover preview. Only used with onSeek. */
  markers?: SeekMarker[];
  /** Holds the seek preview open at this position (ms) without a pointer. For stories and docs. */
  previewAt?: number;
  className?: string;
}

/**
 * A compact, frosted player for a bottom slot of an app frame: a progress line along its top edge (a slim seek bar when `onSeek` is given), art and
 * title (one button that opens the full player), skip back and play-pause. Stateless; pads its bottom by the
 * safe-area inset. Sized in em, so put it inside a .page-scale root.
 */
export function MiniPlayer({
  art,
  title,
  subtitle,
  position,
  duration,
  playing,
  busy,
  skipBackSeconds,
  onSkipBack,
  onTogglePlay,
  onOpen,
  onSeek,
  markers,
  previewAt,
  className,
}: Props) {
  const titleId = useId();
  const fraction = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const playLabel = playing ? 'Pause' : 'Play';
  return (
    <section className={[styles.mini, className].filter(Boolean).join(' ')} aria-label="Now playing">
      {!onSeek && (
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
      <button type="button" className={styles.open} onClick={onOpen} aria-describedby={titleId}>
        <span className={styles.srOnly}>Open player</span>
        <span className={styles.art}>
          <Artwork src={art} lazy={false} className={styles.img} placeholderClassName={styles.noArt} />
        </span>
        <span className={styles.text} aria-hidden="true">
          <span id={titleId} className={styles.title}>
            {title}
          </span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </span>
      </button>
      {onSeek && (
        <div className={styles.bar}>
          <PlaybackTime ms={position} className={styles.time} />
          <SeekBar slim position={position} duration={duration} onSeek={onSeek} markers={markers} previewAt={previewAt} label={`Progress through ${title}`} />
          <PlaybackRemaining position={position} duration={duration} className={styles.time} />
        </div>
      )}
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
    </section>
  );
}
