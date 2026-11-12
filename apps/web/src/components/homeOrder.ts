import type { LibraryItem, Progress, Tile } from '../api/libraries';
import type { RecentTile } from './recentlyAdded';
import { RECENT_CAP } from './recentlyAdded';
import type { SeriesTile } from './continueSeries';

/**
 * Where each book sits on home: the resume hero, then Continue listening, Continue series and Recently added. Home holds
 * this still while it is on screen (see `settle`), so starting a book never moves a tile under the listener's finger.
 */
export interface Placement {
  hero: Tile | undefined;
  listening: Tile[];
  series: SeriesTile[];
  recent: RecentTile[];
}

/** What the data says home would be now, were it built from scratch. */
export interface Fresh {
  /** Continue listening as ABS orders it, most recently played first: the hero, then the rest. */
  listening: Tile[];
  series: SeriesTile[];
  recent: RecentTile[];
  /** Every book still fit to show, wherever it is listed (see `liveBooks`). A placed book not in here has gone. */
  alive: Map<string, Tile>;
}

const ids = (tiles: { item: { id: string } }[]) => tiles.map((t) => t.item.id);

/**
 * Books that may stay on home: those on any of the lists, less finished or hidden ones (the listener's Remove from
 * Continue listening hides) and ones ABS has lost track of. Listed first wins, so pass Continue listening first.
 */
export function liveBooks(
  lists: (LibraryItem & { isMissing?: boolean; isInvalid?: boolean })[][],
  progress: Map<string, Progress>
): Map<string, Tile> {
  const live = new Map<string, Tile>();
  for (const item of lists.flat()) {
    const p = progress.get(item.id);
    if (live.has(item.id) || p?.isFinished || p?.hidden || item.isMissing || item.isInvalid) continue;
    live.set(item.id, { item, progress: p?.progress ?? 0, isFinished: false });
  }
  return live;
}

/**
 * Continue listening with the book in the player first, as the book most recently played: ABS only learns of a book's
 * progress when the player first syncs, so on a visit soon after pressing Play the book would otherwise lag behind the
 * one before it. A book ABS lists nowhere (not in `alive`) can't be shown, so it leaves the list as it was.
 */
export function playerFirst(tiles: Tile[], playerId: string | undefined, alive: Map<string, Tile>): Tile[] {
  if (!playerId || tiles[0]?.item.id === playerId) return tiles;
  const tile = tiles.find((t) => t.item.id === playerId) ?? alive.get(playerId);
  return tile ? [tile, ...tiles.filter((t) => t !== tile)] : tiles;
}

const sameTile = (a: object, b: object) => {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => x[k] === y[k]);
};

/**
 * A placed tile with the newest data: its own shelf's fresh tile when there is one, else the book's progress from where
 * else it is listed (a book begun from Recently added is now in Continue listening). Only contents change, never place.
 */
function refreshed<T extends Tile>(old: T, own: T | undefined, live: Tile): T {
  let next = own;
  if (!next) {
    next = { ...old, item: live.item, progress: live.progress };
    if ('verb' in old) (next as T & { verb: string }).verb = live.progress > 0 ? 'Resume' : 'Play';
  }
  return sameTile(old, next) ? old : next;
}

/**
 * Keeps `held` in order, less books that have gone, and puts each new book (one in `fresh` not placed anywhere yet)
 * after the book that precedes it in `fresh`, or first when none does. `taken` are the books placed on other shelves;
 * `cap` limits the shelf, and it is new books that go first.
 */
function mergeShelf<T extends Tile>(
  held: T[],
  fresh: T[],
  fresher: Map<string, T>,
  alive: Map<string, Tile>,
  taken: Set<string>,
  cap = Infinity
): T[] {
  const out = held.flatMap((t) => {
    const live = alive.get(t.item.id);
    return live ? [refreshed(t, fresher.get(t.item.id), live)] : [];
  });
  const added = new Set<string>();
  const have = new Set(ids(out));
  fresh.forEach((t, i) => {
    const id = t.item.id;
    if (have.has(id) || taken.has(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((o) => o.item.id === fresh[j].item.id);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, t);
    have.add(id);
    added.add(id);
  });
  for (let i = out.length - 1; i >= 0 && out.length > cap; i--) {
    if (added.has(out[i].item.id)) out.splice(i, 1);
  }
  return out;
}

const byId = <T extends Tile>(tiles: T[]) => new Map(tiles.map((t) => [t.item.id, t]));
const sameList = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Home as first built: the first of Continue listening is the hero.
 */
export const place = (fresh: Fresh): Placement => ({
  hero: fresh.listening[0],
  listening: fresh.listening.slice(1),
  series: fresh.series,
  recent: fresh.recent,
});

/**
 * The home to show, given the home already on screen (`held`) and what the data says now (`fresh`).
 *
 * What is on screen stays where it is: the hero stays the hero, and a book keeps its shelf and slot even once it has
 * progress and is no longer something Recently added would list, which is what happens to the book the listener has just
 * started. Only a tile's contents (its progress, its Play or Resume) follow the data. What does move:
 * - a book that has gone (finished, hidden by Remove from Continue listening, or lost) leaves, and the next book of
 *   Continue listening takes the hero's place if it was the hero;
 * - a book not placed yet joins where `fresh` has it among its neighbours, so Undo puts a removed book back where it
 *   was, and a book begun on another device joins in its order.
 * Returns `held` itself when nothing changed. With nothing held yet, home is `fresh` as it stands.
 */
export function settle(held: Placement | null, fresh: Fresh, cap = RECENT_CAP): Placement {
  if (!held) return place(fresh);
  const { alive } = fresh;
  const group = [...(held.hero ? [held.hero] : []), ...held.listening];
  const onShelves = new Set([...ids(held.series), ...ids(held.recent)]);
  const all = mergeShelf(group, fresh.listening, byId(fresh.listening), alive, onShelves);
  const inGroup = new Set(ids(all));
  const series = mergeShelf(
    held.series,
    fresh.series,
    byId(fresh.series),
    alive,
    new Set([...inGroup, ...ids(held.recent)])
  );
  const recent = mergeShelf(
    held.recent,
    fresh.recent,
    byId(fresh.recent),
    alive,
    new Set([...inGroup, ...ids(series)]),
    cap
  );
  const next: Placement = { hero: all[0], listening: all.slice(1), series, recent };
  return next.hero === held.hero &&
    sameList(next.listening, held.listening) &&
    sameList(next.series, held.series) &&
    sameList(next.recent, held.recent)
    ? held
    : next;
}
