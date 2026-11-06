import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
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
  /**
   * What a tap on the bar does on touch and narrow screens (`pointer: coarse` or under 40em). With it, only a drag
   * scrubs there: a tap without movement calls this instead of seeking, so a stray touch can't lose the listener's
   * place. Fine pointers on wide screens still click-to-seek. Works on a read-only bar too.
   */
  onTap?: () => void;
  /** A short line shown above the middle of the bar for about a second whenever it changes (e.g. the mode a tap chose). */
  flash?: string;
  /** A round thumb on the playhead, so the bar reads as draggable. It grows a little under a finger or while dragging. */
  thumb?: boolean;
  className?: string;
}

/** Touch and narrow screens, where a tap names the progress mode instead of seeking. */
const TAP_QUERY = '(pointer: coarse), (width < 40em)';
/** How far a finger may wander (px) and still be a tap. */
const TAP_SLOP = 6;
const FLASH_MS = 1000;

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
  onTap,
  flash,
  thumb,
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

  // Touch and narrow screens, with a tap action: a drag scrubs, a tap calls onTap.
  const touchLike = useMediaQuery(TAP_QUERY);
  const tapMode = !!onTap && touchLike;
  const [pressed, setPressed] = useState(false);
  const gesture = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  // True while a finger is scrubbing: the thumb and fill follow it, and the thumb grows.
  const [scrubbing, setScrubbing] = useState(false);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!tapMode) seekTo(fraction(e) * duration);
  };
  const preview = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || e.buttons > 0) setHover(fraction(e));
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!tapMode) return preview(e);
    gesture.current = { x: e.clientX, y: e.clientY, dragging: false };
    setPressed(true);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!tapMode || !g) return preview(e);
    if (!g.dragging && Math.abs(e.clientX - g.x) > TAP_SLOP) {
      g.dragging = true;
      setScrubbing(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (g.dragging && enabled && !readOnly) setHover(fraction(e));
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setHover(null);
    setScrubbing(false);
    setPressed(false);
    if (!tapMode || !g) return;
    if (!g.dragging) onTap?.();
    else if (!readOnly) seekTo(fraction(e) * duration);
  };
  const cancel = () => {
    gesture.current = null;
    setHover(null);
    setScrubbing(false);
    setPressed(false);
  };

  // The flash shows for a moment each time its text changes.
  const [spent, setSpent] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setSpent(flash), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);
  const flashing = flash && flash !== spent ? flash : null;

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

  // While scrubbing, the bar shows where the finger is (the seek itself lands on release).
  const shownPct = scrubbing && hover !== null ? hover * 100 : pct;
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
        ? tapMode
          ? { role: 'progressbar', onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: cancel }
          : { role: 'progressbar' }
        : {
            onClick,
            onKeyDown,
            onPointerDown: down,
            onPointerMove: move,
            onPointerUp: up,
            onPointerCancel: cancel,
            onPointerLeave: tapMode ? undefined : () => setHover(null),
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
        <div
          className={`${styles.fill}${scrubbing || thumb ? ' ' + styles.still : ''}`}
          style={{ transform: `scaleX(${shownPct / 100})` }}
        />
        {ticks.map((pc) => (
          <span
            key={pc}
            className={pc <= pct ? styles.tickDone : styles.tick}
            style={{ left: `${pc}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {thumb && !readOnly && (
        <span
          className={`${styles.thumb}${scrubbing ? ' ' + styles.thumbDrag : pressed ? ' ' + styles.thumbPress : ''}`}
          style={{ left: `${shownPct}%`, '--x': `-${shownPct}%` } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {seg && (
        <span
          key={seg.index}
          className={styles.segment}
          style={{ left: `${(seg.start / duration) * 100}%`, width: `${((seg.end - seg.start) / duration) * 100}%` }}
          aria-hidden="true"
        />
      )}
      {flashing && (
        <span key={flashing} className={styles.flash} aria-hidden="true">
          {flashing}
        </span>
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
