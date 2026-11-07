import type { ContinueSeriesItem } from '../api/continueSeries';
import type { Progress, Tile } from '../api/libraries';
import { bookInSeries } from '../screens/nextInSeries';

export type SeriesTile = Tile & { sub: string | null };

/**
 * The Continue series shelf: ABS's books in its order, less any already on Continue listening or in the player (`not`),
 * and any begun or finished since ABS built the shelf. Each tile says which book of which series it is.
 */
export function continueSeriesTiles(
  items: ContinueSeriesItem[] | undefined,
  not: Iterable<string>,
  progress: Map<string, Progress>
): SeriesTile[] {
  const seen = new Set(not);
  const tiles: SeriesTile[] = [];
  for (const item of items ?? []) {
    const p = progress.get(item.id);
    if (seen.has(item.id) || p?.isFinished || (p?.progress ?? 0) > 0) continue;
    seen.add(item.id);
    const s = item.media.metadata.series;
    const sub = s ? (s.sequence ? bookInSeries(s.sequence, s.name) : s.name) : item.media.metadata.authorName;
    tiles.push({ item, progress: 0, isFinished: false, sub });
  }
  return tiles;
}
