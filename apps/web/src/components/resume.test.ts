import { describe, expect, it } from 'vitest';
import type { InProgressItem } from '../api/history';
import { progressByItem } from '../api/libraries';
import { continueBooks, resumeStatus, splitResume } from './resume';

const item = (id: string, extra: Partial<InProgressItem> = {}): InProgressItem => ({
  id,
  updatedAt: 1,
  libraryId: 'L1',
  mediaType: 'book',
  progressLastUpdate: 1,
  media: { metadata: { title: id, authorName: 'A' } },
  ...extra,
});
const base = { duration: 1, currentTime: 0, lastUpdate: 0 };
const map = progressByItem([
  { ...base, id: '1', libraryItemId: 'a', progress: 0.2, isFinished: false },
  { ...base, id: '2', libraryItemId: 'b', progress: 0.5, isFinished: false },
  { ...base, id: '3', libraryItemId: 'hid', progress: 0.5, isFinished: false, hideFromContinueListening: true },
]);

describe('continueBooks', () => {
  it("keeps this library's books in ABS order, dropping hidden ones, podcasts and other libraries", () => {
    const tiles = continueBooks(
      [item('a'), item('other', { libraryId: 'L2' }), item('hid'), item('pod', { mediaType: 'podcast' }), item('b')],
      map,
      'L1'
    );
    expect(tiles.map((t) => t.item.id)).toEqual(['a', 'b']);
    expect(tiles.map((t) => t.progress)).toEqual([0.2, 0.5]);
  });
  it('is empty with no data', () => {
    expect(continueBooks(undefined, map, 'L1')).toEqual([]);
  });
});

describe('splitResume', () => {
  it('takes the most recent as the hero and leaves the rest for the shelf', () => {
    const tiles = continueBooks([item('a'), item('b')], map, 'L1');
    const { hero, rest } = splitResume(tiles);
    expect(hero?.item.id).toBe('a');
    expect(rest.map((t) => t.item.id)).toEqual(['b']);
  });
  it('has no hero when nothing is in progress', () => {
    expect(splitResume([])).toEqual({ hero: undefined, rest: [] });
  });
  it('with one book leaves the shelf empty', () => {
    expect(splitResume(continueBooks([item('a')], map, 'L1')).rest).toEqual([]);
  });
  it('once the hero is removed from Continue listening, the next book takes its place and leaves the shelf', () => {
    const c = item('c');
    const before = splitResume(continueBooks([item('a'), item('b'), c], map, 'L1'));
    expect([before.hero?.item.id, before.rest.map((t) => t.item.id)]).toEqual(['a', ['b', 'c']]);
    const hidden = new Map(map).set('a', { ...map.get('a')!, hidden: true });
    const after = splitResume(continueBooks([item('a'), item('b'), c], hidden, 'L1'));
    expect([after.hero?.item.id, after.rest.map((t) => t.item.id)]).toEqual(['b', ['c']]);
  });
  it('removing a shelf book keeps the hero', () => {
    const hidden = new Map(map).set('b', { ...map.get('b')!, hidden: true });
    const after = splitResume(continueBooks([item('a'), item('b'), item('c')], hidden, 'L1'));
    expect([after.hero?.item.id, after.rest.map((t) => t.item.id)]).toEqual(['a', ['c']]);
  });
});

describe('resumeStatus', () => {
  const chapters = [
    { start: 0, end: 100 },
    { start: 100, end: 200 },
    { start: 200, end: 300 },
  ];
  it('names the chapter and the time left', () => {
    expect(resumeStatus({ duration: 300, currentTime: 150, chapters })).toBe('Chapter 2 of 3 · 2m left');
  });
  it("uses the player's chapter when it has one", () => {
    expect(resumeStatus({ duration: 300, currentTime: 150, chapters, chapterIndex: 2 })).toBe(
      'Chapter 3 of 3 · 2m left'
    );
  });
  it('shows hours and minutes', () => {
    expect(resumeStatus({ duration: 36000, currentTime: 20000, chapters: [] })).toBe('4h 26m left');
  });
  it('drops the chapter for a book without chapters, and the time when the length is unknown', () => {
    expect(resumeStatus({ duration: 0, currentTime: 0, chapters })).toBe('Chapter 1 of 3');
    expect(resumeStatus({ duration: 0, currentTime: 0, chapters: [] })).toBe('');
  });
  it('reads under a minute left at the very end', () => {
    expect(resumeStatus({ duration: 300, currentTime: 280, chapters: [] })).toBe('under a minute left');
  });
});
