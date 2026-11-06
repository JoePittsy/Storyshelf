import type { KeyboardEvent, MouseEvent } from 'react';
import { fmtTime } from '../../lib/fmtTime';
import styles from './SeekBar.module.css';

interface Props {
  /** Where it is now, in milliseconds. */
  position: number;
  /** Total length in milliseconds. 0 (unknown) disables seeking. */
  duration: number;
  /** Called with the new position in milliseconds, clamped to 0..duration. */
  onSeek: (ms: number) => void;
  /** What an arrow key moves by. Default 5 seconds. */
  stepMs?: number;
  /** Accessible name. */
  label?: string;
  className?: string;
}

/** Click-and-keyboard seek bar. Stateless: the caller owns the playhead and re-renders it as it moves. */
export function SeekBar({ position, duration, onSeek, stepMs = 5000, label = 'Progress', className }: Props) {
  const enabled = duration > 0;
  const pct = enabled ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  const seekTo = (ms: number) => {
    if (enabled) onSeek(Math.floor(Math.min(duration, Math.max(0, ms))));
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0) seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const now = (pct / 100) * duration;
    const target =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown'
        ? now - stepMs
        : e.key === 'ArrowRight' || e.key === 'ArrowUp'
          ? now + stepMs
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? duration
              : null;
    if (target === null) return;
    e.preventDefault();
    seekTo(target);
  };

  return (
    <div
      className={[styles.seek, className].filter(Boolean).join(' ')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-disabled={enabled ? undefined : true}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={enabled ? `${fmtTime(position)} of ${fmtTime(duration)}` : undefined}
    >
      <div className={styles.track}>
        <div className={styles.fill} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}
