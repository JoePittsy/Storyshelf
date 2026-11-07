import type { RecentItem } from '../api/continueSeries';
import type { Progress, Tile } from '../api/libraries';

/** Most books on the Recently added shelf: enough for a phone to scroll a little and a desk to fill a row. */
export const RECENT_CAP = 12;

export type RecentTile = Tile & {
  /** "Added 3 days ago". */
  meta: string | null;
  /** What the tile's play button does: Start for an unstarted book, Resume for one already begun. */
  verb: 'Start' | 'Resume';
};

const DAY = 86_400_000;
const midnight = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * When a book was added, short: "Added today", "Added yesterday", "Added 3 days ago", then weeks, months and years.
 * Days are counted by the calendar (last night is yesterday). Null when ABS gave no date.
 */
export function addedAgo(addedAt: number | undefined, now: number): string | null {
  if (!addedAt) return null;
  const days = Math.max(0, Math.round((midnight(now) - midnight(addedAt)) / DAY));
  if (days === 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < 7) return `Added ${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Added a week ago' : `Added ${weeks} weeks ago`;
  }
  const a = new Date(addedAt);
  const n = new Date(now);
  const months = Math.max(
    1,
    (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth() - (a.getDate() > n.getDate() ? 1 : 0)
  );
  if (months < 12) return months === 1 ? 'Added a month ago' : `Added ${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'Added a year ago' : `Added ${years} years ago`;
}

/**
 * The Recently added shelf: ABS's newest books in its order, less any finished, any already on home (the hero,
 * Continue listening, Continue series) or in the player (`not`), any the listener removed from Continue listening
 * (taken off home, so it stays off), and any ABS has lost track of. Capped at RECENT_CAP.
 */
export function recentlyAddedTiles(
  items: RecentItem[] | undefined,
  not: Iterable<string>,
  progress: Map<string, Progress>,
  now: number
): RecentTile[] {
  const seen = new Set(not);
  const tiles: RecentTile[] = [];
  for (const item of items ?? []) {
    if (tiles.length >= RECENT_CAP) break;
    const p = progress.get(item.id);
    if (seen.has(item.id) || p?.isFinished || p?.hidden || item.isMissing || item.isInvalid) continue;
    seen.add(item.id);
    const fraction = p?.progress ?? 0;
    tiles.push({
      item,
      progress: fraction,
      isFinished: false,
      meta: addedAgo(item.addedAt, now),
      verb: fraction > 0 ? 'Resume' : 'Start',
    });
  }
  return tiles;
}
