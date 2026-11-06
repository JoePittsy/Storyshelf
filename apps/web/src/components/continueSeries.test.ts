import { describe, expect, it } from 'vitest';
import type { ContinueSeriesItem } from '../api/continueSeries';
import type { Progress } from '../api/libraries';
import { continueSeriesTiles } from './continueSeries';

const book = (id: string, series?: { name: string; sequence: string | null }, authorName: string | null = 'An Author'): ContinueSeriesItem => ({
  id,
  updatedAt: 1,
  media: {
    metadata: { title: `Title ${id}`, authorName, series: series && { id: `s-${series.name}`, ...series } },
  },
});
const ids = (tiles: { item: { id: string } }[]) => tiles.map((t) => t.item.id);

describe('continueSeriesTiles', () => {
  const shelf = [book('a', { name: 'Sherlock Holmes', sequence: '2' }), book('b', { name: 'Discworld', sequence: '5' }), book('c')];

  it("keeps ABS's order and says which book of which series", () => {
    const tiles = continueSeriesTiles(shelf, [], new Map());
    expect(ids(tiles)).toEqual(['a', 'b', 'c']);
    expect(tiles.map((t) => t.sub)).toEqual(['Book 2 of Sherlock Holmes', 'Book 5 of Discworld', 'An Author']);
  });

  it('names just the series when the book has no number in it', () => {
    expect(continueSeriesTiles([book('x', { name: 'Tales', sequence: null })], [], new Map())[0]?.sub).toBe('Tales');
  });

  it('never repeats a book already in Continue listening (the hero or the shelf), or the one in the player', () => {
    expect(ids(continueSeriesTiles(shelf, ['a', 'c'], new Map()))).toEqual(['b']);
  });

  it('drops a book begun or finished since ABS built the shelf', () => {
    const progress = new Map<string, Progress>([
      ['a', { progress: 0.1, isFinished: false }],
      ['b', { progress: 1, isFinished: true }],
    ]);
    expect(ids(continueSeriesTiles(shelf, [], progress))).toEqual(['c']);
  });

  it('lists a book once, and has nothing when ABS has nothing', () => {
    expect(ids(continueSeriesTiles([...shelf, shelf[0] as ContinueSeriesItem], [], new Map()))).toEqual(['a', 'b', 'c']);
    expect(continueSeriesTiles(undefined, [], new Map())).toEqual([]);
    expect(continueSeriesTiles([], ['a'], new Map())).toEqual([]);
  });

  it('starts every tile from nothing: none of them is under way', () => {
    expect(continueSeriesTiles(shelf, [], new Map()).every((t) => t.progress === 0 && !t.isFinished)).toBe(true);
  });
});
