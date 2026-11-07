import { describe, expect, it } from 'vitest';
import type { RecentItem } from '../api/continueSeries';
import type { Progress } from '../api/libraries';
import { addedAgo, RECENT_CAP, recentlyAddedTiles } from './recentlyAdded';

// Saturday 7 November 2026, 18:00 local time.
const NOW = new Date(2026, 10, 7, 18, 0).getTime();
const at = (daysAgo: number, hour = 12) => new Date(2026, 10, 7 - daysAgo, hour).getTime();

const book = (id: string, addedAt = at(1), extra: Partial<RecentItem> = {}): RecentItem => ({
  id,
  updatedAt: 1,
  addedAt,
  media: { metadata: { title: `Title ${id}`, authorName: 'An Author' } },
  ...extra,
});
const ids = (tiles: { item: { id: string } }[]) => tiles.map((t) => t.item.id);
const none = new Map<string, Progress>();

describe('addedAgo', () => {
  it('says today and yesterday by the calendar, not by 24-hour spans', () => {
    expect(addedAgo(at(0, 1), NOW)).toBe('Added today');
    expect(addedAgo(at(1, 23), NOW)).toBe('Added yesterday');
    expect(addedAgo(at(1, 0), NOW)).toBe('Added yesterday');
  });

  it('counts days for the first week', () => {
    expect(addedAgo(at(2), NOW)).toBe('Added 2 days ago');
    expect(addedAgo(at(6), NOW)).toBe('Added 6 days ago');
  });

  it('then weeks, months and years, kept short', () => {
    expect(addedAgo(at(7), NOW)).toBe('Added a week ago');
    expect(addedAgo(at(13), NOW)).toBe('Added a week ago');
    expect(addedAgo(at(14), NOW)).toBe('Added 2 weeks ago');
    expect(addedAgo(at(29), NOW)).toBe('Added 4 weeks ago');
    expect(addedAgo(at(30), NOW)).toBe('Added a month ago');
    expect(addedAgo(at(95), NOW)).toBe('Added 3 months ago');
    expect(addedAgo(at(364), NOW)).toBe('Added 11 months ago');
    expect(addedAgo(at(365), NOW)).toBe('Added a year ago');
    expect(addedAgo(at(800), NOW)).toBe('Added 2 years ago');
  });

  it('treats a time just ahead of the clock (a skewed server) as today, and has nothing for no date', () => {
    expect(addedAgo(NOW + 60_000, NOW)).toBe('Added today');
    expect(addedAgo(undefined, NOW)).toBeNull();
  });
});

describe('recentlyAddedTiles', () => {
  const shelf = [book('a', at(0)), book('b', at(3)), book('c', at(20))];

  it("keeps ABS's order (newest first) and says when each book was added", () => {
    const tiles = recentlyAddedTiles(shelf, [], none, NOW);
    expect(ids(tiles)).toEqual(['a', 'b', 'c']);
    expect(tiles.map((t) => t.meta)).toEqual(['Added today', 'Added 3 days ago', 'Added 2 weeks ago']);
  });

  it('leaves out finished books', () => {
    const progress = new Map<string, Progress>([['b', { progress: 1, isFinished: true }]]);
    expect(ids(recentlyAddedTiles(shelf, [], progress, NOW))).toEqual(['a', 'c']);
  });

  it('never repeats a book shown elsewhere on home: the hero, Continue listening, Continue series or the player', () => {
    expect(ids(recentlyAddedTiles(shelf, ['a', 'c'], none, NOW))).toEqual(['b']);
  });

  it('offers an unstarted book to play, and one already begun to resume', () => {
    const progress = new Map<string, Progress>([['b', { progress: 0.4, isFinished: false }]]);
    const tiles = recentlyAddedTiles(shelf, [], progress, NOW);
    expect(tiles.map((t) => [t.item.id, t.verb, t.progress])).toEqual([
      ['a', 'Play', 0],
      ['b', 'Resume', 0.4],
      ['c', 'Play', 0],
    ]);
  });

  it('respects Remove from Continue listening: a book the listener took off home stays off', () => {
    const progress = new Map<string, Progress>([['b', { progress: 0.4, isFinished: false, hidden: true }]]);
    expect(ids(recentlyAddedTiles(shelf, [], progress, NOW))).toEqual(['a', 'c']);
  });

  it('leaves out books ABS marks missing or invalid', () => {
    const odd = [book('m', at(0), { isMissing: true }), book('i', at(0), { isInvalid: true }), book('ok')];
    expect(ids(recentlyAddedTiles(odd, [], none, NOW))).toEqual(['ok']);
  });

  it(`stops at ${RECENT_CAP} books`, () => {
    const many = Array.from({ length: 20 }, (_, i) => book(`x${i}`));
    expect(recentlyAddedTiles(many, [], none, NOW)).toHaveLength(RECENT_CAP);
    expect(ids(recentlyAddedTiles(many, ['x0'], none, NOW))[0]).toBe('x1');
  });

  it('lists a book once, and is empty when ABS has nothing or everything is accounted for', () => {
    expect(ids(recentlyAddedTiles([...shelf, book('a')], [], none, NOW))).toEqual(['a', 'b', 'c']);
    expect(recentlyAddedTiles(undefined, [], none, NOW)).toEqual([]);
    expect(recentlyAddedTiles(shelf, ['a', 'b', 'c'], none, NOW)).toEqual([]);
  });
});
