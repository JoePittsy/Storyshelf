const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** How far the cover has run in before it reaches the bar, as a multiple of its height. */
export const DOCK_LEAD = 0.25;

/**
 * Dock progress from scroll geometry: 0 while the hero cover is clear of the top bar (with `lead` x its height of
 * run-in), 1 once it has scrolled fully under it, linear in between. `top` is the cover's viewport top.
 */
export function dockProgress(top: number, height: number, barBottom: number, lead = DOCK_LEAD): number {
  if (!(height > 0) || !Number.isFinite(top) || !Number.isFinite(barBottom)) return 0;
  const run = lead * height;
  return clamp01((barBottom + run - top) / (height + run));
}
