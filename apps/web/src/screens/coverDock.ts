/** Dock once the hero cover is fully out of view; undock once about half is back (hysteresis stops flicker at the edge). */
export const UNDOCK_RATIO = 0.5;
/** IntersectionObserver thresholds that make nextDocked see both edges. */
export const DOCK_THRESHOLDS = [0, UNDOCK_RATIO];

/** `ratio` is the hero cover's intersectionRatio against the area below the top bar. */
export function nextDocked(docked: boolean, ratio: number): boolean {
  return docked ? ratio < UNDOCK_RATIO : ratio === 0;
}
