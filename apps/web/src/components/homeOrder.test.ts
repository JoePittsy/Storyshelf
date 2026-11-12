import { describe, expect, it } from 'vitest';
import type { LibraryItem, Progress, Tile } from '../api/libraries';
import type { SeriesTile } from './continueSeries';
import type { RecentTile } from './recentlyAdded';
import { liveBooks, place, playerFirst, settle } from './homeOrder';
import type { Fresh, Placement } from './homeOrder';

// The same book is the same object from one fetch to the next, as TanStack Query's structural sharing keeps it.
const items = new Map<string, LibraryItem>();
const item = (id: string): LibraryItem => {
  const known = items.get(id);
  if (known) return known;
  const made = { id, updatedAt: 1, media: { metadata: { title: `Title ${id}`, authorName: 'An Author' } } };
  items.set(id, made);
  return made;
};
const tile = (id: string, progress = 0.3): Tile => ({ item: item(id), progress, isFinished: false });
const seriesTile = (id: string): SeriesTile => ({ ...tile(id, 0), sub: 'Book 1 of A' });
const recentTile = (id: string, progress = 0): RecentTile => ({
  ...tile(id, progress),
  meta: 'Added today',
  verb: progress > 0 ? 'Resume' : 'Play',
});
const ids = (tiles: { item: { id: string } }[]) => tiles.map((t) => t.item.id);

/** What the data says now: `alive` is every book on any list, unless `gone` has it. */
function data(
  listening: string[],
  series: string[],
  recent: string[],
  { gone = [], progress = {} }: { gone?: string[]; progress?: Record<string, number> } = {}
): Fresh {
  const p = (id: string) => progress[id] ?? 0;
  const lists = [
    listening.map((id) => tile(id, p(id) || 0.3)),
    series.map((id) => seriesTile(id)),
    recent.map((id) => recentTile(id, p(id))),
  ];
  const alive = new Map(
    lists
      .flat()
      .filter((t) => !gone.includes(t.item.id))
      .reverse()
      .map((t) => [t.item.id, { item: t.item, progress: t.progress, isFinished: false }] as const)
      .reverse()
  );
  return {
    listening: lists[0].filter((t) => !gone.includes(t.item.id)) as Tile[],
    series: lists[1].filter((t) => !gone.includes(t.item.id)) as SeriesTile[],
    recent: lists[2].filter((t) => !gone.includes(t.item.id)) as RecentTile[],
    alive,
  };
}
const shape = (p: Placement) => [p.hero ? p.hero.item.id : null, ids(p.listening), ids(p.series), ids(p.recent)];

describe('place', () => {
  it('makes the first of Continue listening the hero', () => {
    expect(shape(place(data(['a', 'b'], ['s'], ['r'])))).toEqual(['a', ['b'], ['s'], ['r']]);
    expect(shape(place(data([], [], ['r'])))).toEqual([null, [], [], ['r']]);
  });
});

describe('settle', () => {
  const first = place(data(['a', 'b'], ['s'], ['r1', 'r2', 'r3']));

  it('shows the data as it stands when nothing is held yet', () => {
    const fresh = data(['a'], [], ['r1']);
    expect(settle(null, fresh)).toEqual(place(fresh));
  });

  it('is the held home itself when nothing has changed, and again once settled (it ends)', () => {
    const fresh = data(['a', 'b'], ['s'], ['r1', 'r2', 'r3']);
    expect(settle(first, fresh)).toBe(first);
    const moved = settle(first, data(['a', 'b', 'x'], ['s'], ['r1', 'r2', 'r3']));
    expect(settle(moved, data(['a', 'b', 'x'], ['s'], ['r1', 'r2', 'r3']))).toBe(moved);
  });

  it('keeps a Recently added book in its slot when it begins, and updates its contents', () => {
    // r2 is begun: ABS now lists it first in Continue listening, and Recently added no longer lists it.
    const fresh = data(['r2', 'a', 'b'], ['s'], ['r1', 'r3'], { progress: { r2: 0.02 } });
    const next = settle(first, fresh);
    expect(shape(next)).toEqual(['a', ['b'], ['s'], ['r1', 'r2', 'r3']]);
    const r2 = next.recent[1];
    expect(r2.progress).toBe(0.02);
    expect(r2.verb).toBe('Resume');
    expect(r2.meta).toBe('Added today');
    expect(next.recent[0]).toBe(first.recent[0]);
  });

  it('leaves when no list has it any more, and stays while any list does', () => {
    const next = settle(first, data(['a', 'b'], ['s'], ['r1', 'r3']));
    // r2 is not in any list now, so it is gone: this is what Remove and a finished book look like.
    expect(ids(next.recent)).toEqual(['r1', 'r3']);
    const held = settle(first, {
      ...data(['a', 'b'], ['s'], ['r1', 'r3']),
      alive: data(['a', 'b'], ['s'], ['r1', 'r2', 'r3']).alive,
    });
    expect(ids(held.recent)).toEqual(['r1', 'r2', 'r3']);
  });

  it('keeps a Continue series book in its slot once it has progress, saying Resume', () => {
    const fresh = data(['s', 'a', 'b'], [], ['r1', 'r2', 'r3'], { progress: { s: 0.05 } });
    const next = settle(first, fresh);
    expect(shape(next)).toEqual(['a', ['b'], ['s'], ['r1', 'r2', 'r3']]);
    expect(next.series[0].progress).toBe(0.05);
    expect(next.series[0].sub).toBe('Book 1 of A');
  });

  it('keeps the hero and the order of Continue listening when the data puts another book first', () => {
    const next = settle(first, data(['b', 'a'], ['s'], ['r1', 'r2', 'r3']));
    expect(shape(next)).toEqual(['a', ['b'], ['s'], ['r1', 'r2', 'r3']]);
  });

  it('refreshes the progress of the hero and the shelf without moving them', () => {
    const next = settle(first, data(['a', 'b'], ['s'], ['r1', 'r2', 'r3'], { progress: { a: 0.9, b: 0.4 } }));
    expect(shape(next)).toEqual(['a', ['b'], ['s'], ['r1', 'r2', 'r3']]);
    expect(next.hero?.progress).toBe(0.9);
    expect(next.listening[0].progress).toBe(0.4);
  });

  it('drops a removed shelf book at once and the rest stay', () => {
    const next = settle(first, data(['a'], ['s'], ['r1', 'r2', 'r3'], { gone: ['b'] }));
    expect(shape(next)).toEqual(['a', [], ['s'], ['r1', 'r2', 'r3']]);
  });

  it('makes the next book the hero when the hero is removed, and Undo puts it back first', () => {
    const removed = settle(first, data(['a', 'b'], ['s'], ['r1', 'r2', 'r3'], { gone: ['a'] }));
    expect(shape(removed)).toEqual(['b', [], ['s'], ['r1', 'r2', 'r3']]);
    const undone = settle(removed, data(['a', 'b'], ['s'], ['r1', 'r2', 'r3']));
    expect(shape(undone)).toEqual(['a', ['b'], ['s'], ['r1', 'r2', 'r3']]);
  });

  it('puts an Undone shelf book back among its neighbours', () => {
    const three = place(data(['a', 'b', 'c'], [], []));
    const removed = settle(three, data(['a', 'c'], [], [], { gone: ['b'] }));
    expect(shape(removed)).toEqual(['a', ['c'], [], []]);
    expect(shape(settle(removed, data(['a', 'b', 'c'], [], [])))).toEqual(['a', ['b', 'c'], [], []]);
  });

  it('drops a book that has finished, from whichever shelf it is on', () => {
    const next = settle(first, data(['a', 'b'], ['s'], ['r1', 'r2', 'r3'], { gone: ['s', 'r2'] }));
    expect(shape(next)).toEqual(['a', ['b'], [], ['r1', 'r3']]);
  });

  it('drops the hero and the held home empties to what is left', () => {
    const next = settle(first, data([], [], [], { gone: ['a', 'b', 's', 'r1', 'r2', 'r3'] }));
    expect(shape(next)).toEqual([null, [], [], []]);
  });

  it('adds a new book after the one before it, last on a shelf, never in place of the hero', () => {
    const next = settle(first, data(['n', 'a', 'b'], ['s', 'n2'], ['r1', 'r2', 'r3', 'r4']));
    // n precedes a in the data, so it would lead; with nothing before it, it does (a begun on another device).
    expect(shape(next)).toEqual(['n', ['a', 'b'], ['s', 'n2'], ['r1', 'r2', 'r3', 'r4']]);
    const late = settle(first, data(['a', 'b', 'n'], ['s'], ['r1', 'r2', 'r3']));
    expect(shape(late)).toEqual(['a', ['b', 'n'], ['s'], ['r1', 'r2', 'r3']]);
  });

  it('never lists a book twice: one placed on a shelf is not added again where the data now has it', () => {
    const next = settle(first, data(['r2', 's', 'a', 'b'], [], ['r1', 'r3'], { progress: { r2: 0.1 } }));
    const all = [next.hero?.item.id, ...ids(next.listening), ...ids(next.series), ...ids(next.recent)];
    expect(new Set(all).size).toBe(all.length);
    expect(shape(next)).toEqual(['a', ['b'], ['s'], ['r1', 'r2', 'r3']]);
  });

  it('keeps Recently added to its cap, losing new books first', () => {
    const held = place(data([], [], ['r1', 'r2']));
    expect(ids(settle(held, data([], [], ['r0', 'r1', 'r2']), 2).recent)).toEqual(['r1', 'r2']);
    expect(ids(settle(held, data([], [], ['r0', 'r1', 'r2']), 3).recent)).toEqual(['r0', 'r1', 'r2']);
  });

  it('fills in as data arrives after a first, empty settle', () => {
    const empty = place(data([], [], []));
    expect(shape(settle(empty, data(['a', 'b'], ['s'], ['r1'])))).toEqual(['a', ['b'], ['s'], ['r1']]);
  });
});

describe('playerFirst', () => {
  const alive = new Map([['p', tile('p', 0)]]);
  it('moves the book in the player to the front of Continue listening', () => {
    expect(ids(playerFirst([tile('a'), tile('b'), tile('c')], 'c', new Map()))).toEqual(['c', 'a', 'b']);
  });
  it('brings in the book the server has not heard of yet, from the other lists', () => {
    expect(ids(playerFirst([tile('a')], 'p', alive))).toEqual(['p', 'a']);
  });
  it('leaves the list alone with nothing playing, the hero already playing, or a book listed nowhere', () => {
    const list = [tile('a'), tile('b')];
    expect(playerFirst(list, undefined, alive)).toBe(list);
    expect(playerFirst(list, 'a', alive)).toBe(list);
    expect(playerFirst(list, 'zzz', alive)).toBe(list);
  });
});

describe('liveBooks', () => {
  const progress = new Map<string, Progress>([
    ['fin', { progress: 1, isFinished: true }],
    ['hid', { progress: 0.4, isFinished: false, hidden: true }],
    ['mid', { progress: 0.4, isFinished: false }],
  ]);
  it('lists every book on any list but finished, hidden, missing and invalid ones, first list winning', () => {
    const live = liveBooks(
      [
        [item('mid'), item('fin'), item('hid')],
        [item('new'), item('mid'), { ...item('lost'), isMissing: true }, { ...item('bad'), isInvalid: true }],
      ],
      progress
    );
    expect([...live.keys()]).toEqual(['mid', 'new']);
    expect(live.get('mid')?.progress).toBe(0.4);
    expect(live.get('new')?.progress).toBe(0);
  });
});
