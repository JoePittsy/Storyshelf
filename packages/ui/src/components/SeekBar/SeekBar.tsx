import { useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { fmtTime } from '../../lib/fmtTime';
import { markerAt, markerPercents } from '../../lib/seekMarkers';
import type { SeekMarker } from '../../lib/seekMarkers';
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
  /** Chapter starts and the like: drawn as ticks, named in the hover preview and in the spoken value. */
  markers?: SeekMarker[];
  /** Shows the preview at this position (ms) without a pointer. For stories and docs. */
  previewAt?: number;
  /** Accessible name. */
  label?: string;
  className?: string;
}

/** Click-and-keyboard seek bar. Stateless: the caller owns the playhead and re-renders it as it moves. */
export function SeekBar({
  position,
  duration,
  onSeek,
  stepMs = 5000,
  markers,
  previewAt,
  label = 'Progress',
  className,
}: Props) {
  const enabled = duration > 0;
  const pct = enabled ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  // Preview position as a fraction of the bar: under a mouse, or under a finger while it is down.
  const [hover, setHover] = useState<number | null>(null);
  const shown = enabled ? (previewAt !== undefined ? previewAt / duration : hover) : null;

  const seekTo = (ms: number) => {
    if (enabled) onSeek(Math.floor(Math.min(duration, Math.max(0, ms))));
  };

  const fraction = (e: { clientX: number; currentTarget: HTMLElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0;
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => seekTo(fraction(e) * duration);
  const preview = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || e.buttons > 0) setHover(fraction(e));
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

  const here = markerAt(markers, position)?.label;
  const hoverMs = shown === null ? 0 : shown * duration;
  const hoverLabel = shown === null ? undefined : markerAt(markers, hoverMs)?.label;

  return (
    <div
      className={[styles.seek, className].filter(Boolean).join(' ')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerDown={preview}
      onPointerMove={preview}
      onPointerUp={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
      onPointerLeave={() => setHover(null)}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-disabled={enabled ? undefined : true}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={enabled ? `${fmtTime(position)} of ${fmtTime(duration)}${here ? `, ${here}` : ''}` : undefined}
    >
      <div className={styles.track}>
        <div className={styles.fill} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      {markerPercents(markers, duration).map((pc) => (
        <span key={pc} className={styles.tick} style={{ left: `${pc}%` }} aria-hidden="true" />
      ))}
      {shown !== null && (
        <span
          className={styles.preview}
          style={{ left: `${shown * 100}%`, transform: `translateX(-${shown * 100}%)` }}
          aria-hidden="true"
        >
          {fmtTime(hoverMs)}
          {hoverLabel ? ` · ${hoverLabel}` : ''}
        </span>
      )}
    </div>
  );
}
