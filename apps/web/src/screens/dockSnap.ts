import { tFromScroll } from '@joepittsy/ui';

export interface DockSnap {
  /** Dock progress at the current scroll position. */
  t: number;
  /** scrollY of the nearer end (t = 0 or t = 1), or null when already at an end. */
  target: number | null;
}

/** The run-in tFromScroll uses by default; the end positions below invert the same mapping. */
export const DOCK_LEAD = 0.25;

/**
 * Where to settle the page when scrolling stops. `top` is the cover's current viewport top, so its document position
 * is `top + scrollY`. tFromScroll is linear between its ends, so the scroll for t = 0 is where the cover is
 * `lead x height` below the bar, and for t = 1 where it has scrolled fully under it. Both are clamped to the
 * scrollable range; the nearer one by progress wins (a tie goes to the cover staying in the hero).
 */
export function snapToDockEnd(
  top: number,
  height: number,
  barBottom: number,
  scrollY: number,
  maxScroll: number,
  lead = DOCK_LEAD,
): DockSnap {
  const t = tFromScroll(top, height, barBottom, lead);
  if (t <= 0 || t >= 1) return { t, target: null };
  const docTop = top + scrollY;
  const clamp = (y: number) => Math.min(Math.max(0, maxScroll), Math.max(0, y));
  const target = t < 0.5 ? clamp(docTop - barBottom - lead * height) : clamp(docTop - barBottom + height);
  return { t, target: Math.abs(target - scrollY) < 1 ? null : target };
}
