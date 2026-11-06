export interface SeekMarker {
  /** Milliseconds from the start. */
  at: number;
  /** What starts here, e.g. "Chapter 7: The Hollow". */
  label: string;
}

/** Tick positions (percent along the bar). Drops 0, anything at or past the end, and repeats. */
export function markerPercents(markers: SeekMarker[] | undefined, duration: number): number[] {
  if (!markers || duration <= 0) return [];
  const ms = [...new Set(markers.map((m) => m.at).filter((at) => at > 0 && at < duration))];
  return ms.map((at) => (at / duration) * 100);
}

/** Fewest pixels per tick before the ticks merge into a barcode. */
export const MIN_TICK_PX = 10;

/** Whether `count` ticks fit a bar `widthPx` wide with at least `minPx` each. False until the width is known (0). */
export function showTicks(count: number, widthPx: number, minPx = MIN_TICK_PX): boolean {
  return count > 0 && widthPx > 0 && widthPx / count >= minPx;
}

/** The marker containing `ms`: the last one starting at or before it. Undefined before the first or with none. */
export function markerAt(markers: SeekMarker[] | undefined, ms: number): SeekMarker | undefined {
  let found: SeekMarker | undefined;
  for (const m of markers ?? []) if (m.at <= ms && (!found || m.at >= found.at)) found = m;
  return found;
}
