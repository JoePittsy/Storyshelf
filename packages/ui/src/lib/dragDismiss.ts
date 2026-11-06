/** One pointer reading during a drag: vertical position in px and a timestamp in ms. */
export interface DragSample {
  y: number;
  t: number;
}

/** Past this speed (px per ms, downward) a short flick dismisses. */
export const FLICK_VELOCITY = 0.5;
/** A flick must have travelled at least this far (px), so a twitch doesn't close the sheet. */
export const FLICK_MIN_DISTANCE = 24;
/** An upward speed (px per ms) at or beyond this cancels, however far the sheet was pulled. */
export const CANCEL_VELOCITY = -0.3;

/** Distance (px) that dismisses on its own: a quarter of the sheet, kept between 80 and 160. */
export function dismissThreshold(height: number): number {
  return Math.min(160, Math.max(80, height * 0.25));
}

/**
 * Downward speed (px per ms) over the last `windowMs` of the drag, so a finger that slowed down before lifting
 * reads slow. Needs two samples in the window; otherwise 0.
 */
export function releaseVelocity(samples: DragSample[], windowMs = 100): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const first = samples.find((s) => last.t - s.t <= windowMs);
  if (!first || first === last || last.t === first.t) return 0;
  return (last.y - first.y) / (last.t - first.t);
}

/** Whether letting go now dismisses the sheet: pulled far enough, or flicked down fast enough. */
export function shouldDismiss({ dy, velocity, height }: { dy: number; velocity: number; height: number }): boolean {
  if (dy <= 0 || velocity <= CANCEL_VELOCITY) return false;
  if (dy >= dismissThreshold(height)) return true;
  return velocity >= FLICK_VELOCITY && dy >= FLICK_MIN_DISTANCE;
}
