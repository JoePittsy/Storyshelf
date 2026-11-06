import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { fmtTime } from '../../lib/fmtTime';
import { markerAt, markerPercents, segmentAt, showTicks } from '../../lib/seekMarkers';
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
  /** A thinner track in a taller hit area, for tight bars such as the mini player. */
  slim?: boolean;
  /** Shows progress only: a progressbar that can't be focused, clicked or dragged (onSeek is never called). */
  readOnly?: boolean;
  /** Replaces the spoken value ("Stops in 12:30"). */
  valueText?: string;
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
  slim,
  readOnly,
  valueText,
  className,
}: Props) {
  const enabled = duration > 0;
  // Ticks only when each gets room, so measure the bar. Without ResizeObserver (jsdom) there are none.
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  const percents = markerPercents(markers, duration);
  const ticks = showTicks(percents.length, width) ? percents : [];
  const here = markerAt(markers, position)?.label;
  const hoverMs = shown === null ? 0 : shown * duration;
  const hoverLabel = shown === null ? undefined : markerAt(markers, hoverMs)?.label;

  // The chapter under the pointer, lifted out of the bar. Not on read-only bars (nothing to point at).
  const seg = !readOnly && (markers?.length ?? 0) >= 2 && shown !== null ? segmentAt(markers, hoverMs, duration) : null;

  return (
    <div
      ref={root}
      className={[styles.seek, slim && styles.slim, className].filter(Boolean).join(' ')}
      {...(readOnly
        ? { role: 'progressbar' }
        : {
            onClick,
            onKeyDown,
            onPointerDown: preview,
            onPointerMove: preview,
            onPointerUp: () => setHover(null),
            onPointerCancel: () => setHover(null),
            onPointerLeave: () => setHover(null),
            role: 'slider',
            tabIndex: 0,
            'aria-disabled': enabled ? undefined : true,
          })}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={
        valueText ??
        (enabled ? `${fmtTime(position)} of ${fmtTime(duration)}${here && !readOnly ? `, ${here}` : ''}` : undefined)
      }
    >
      <div className={styles.track}>
        <div className={styles.fill} style={{ transform: `scaleX(${pct / 100})` }} />
        {ticks.map((pc) => (
          <span
            key={pc}
            className={pc <= pct ? styles.tickDone : styles.tick}
            style={{ left: `${pc}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {seg && (
        <span
          key={seg.index}
          className={styles.segment}
          style={{ left: `${(seg.start / duration) * 100}%`, width: `${((seg.end - seg.start) / duration) * 100}%` }}
          aria-hidden="true"
        />
      )}
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
