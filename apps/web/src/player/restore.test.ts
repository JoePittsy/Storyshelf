import { describe, expect, it } from 'vitest';
import type { InProgressItem } from '../api/history';
import type { Progress } from '../api/libraries';
import { chooseStart, pickRestorable, refreshedPosition, restoredPatch, restoredSeek } from './restore';

const inProgress = (id: string, extra: Partial<InProgressItem> = {}): InProgressItem => ({
  id,
  updatedAt: 1,
  libraryId: 'lib1',
  mediaType: 'book',
  progressLastUpdate: 1,
  media: { metadata: { title: `Title ${id}`, authorName: 'An Author' }, duration: 1000 },
  ...extra,
});
const prog = (entries: [string, Partial<Progress>][]) =>
  new Map<string, Progress>(
    entries.map(([id, p]) => [id, { progress: 0.2, isFinished: false, currentTime: 200, ...p }])
  );

const chapters = [
  { id: 0, start: 0, end: 300, title: 'One' },
  { id: 1, start: 300, end: 1000, title: 'Two' },
];

describe('pickRestorable', () => {
  it('puts back the book listened to here since, ahead of the one the server last saw', () => {
    const progress = prog([
      ['a', { lastUpdate: 5000 }],
      ['b', { lastUpdate: 3000 }],
    ]);
    const here = new Map([['b', { updatedAt: 9000 }]]);
    const got = pickRestorable([inProgress('a'), inProgress('b')], progress, 'lib1', (id) => here.get(id));
    expect(got?.id).toBe('b');
    // An older place here doesn't override the server's newer one.
    const stale = new Map([['b', { updatedAt: 4000 }]]);
    expect(pickRestorable([inProgress('a'), inProgress('b')], progress, 'lib1', (id) => stale.get(id))?.id).toBe('a');
  });

  it('takes the most recently played book of this library, with where it was left', () => {
    const got = pickRestorable(
      [inProgress('a'), inProgress('b')],
      prog([
        ['a', {}],
        ['b', {}],
      ]),
      'lib1'
    );
    expect(got).toEqual({
      id: 'a',
      title: 'Title a',
      author: 'An Author',
      duration: 1000,
      position: 200,
      updatedAt: 0,
    });
  });
  it('skips other libraries, podcasts and hidden books', () => {
    const items = [
      inProgress('other', { libraryId: 'lib2' }),
      inProgress('pod', { mediaType: 'podcast' }),
      inProgress('hid'),
      inProgress('ok'),
    ];
    const got = pickRestorable(
      items,
      prog([
        ['hid', { hidden: true }],
        ['ok', {}],
      ]),
      'lib1'
    );
    expect(got?.id).toBe('ok');
  });
  it('skips a finished book, and one with no place to return to', () => {
    expect(pickRestorable([inProgress('a')], prog([['a', { isFinished: true }]]), 'lib1')).toBeUndefined();
    expect(pickRestorable([inProgress('a')], prog([['a', { currentTime: 0, progress: 0 }]]), 'lib1')).toBeUndefined();
  });
  it('is undefined with nothing in progress', () => {
    expect(pickRestorable(undefined, new Map(), 'lib1')).toBeUndefined();
    expect(pickRestorable([], new Map(), 'lib1')).toBeUndefined();
  });
  it('works the place out from the fraction when the server gave no time', () => {
    const got = pickRestorable([inProgress('a')], prog([['a', { currentTime: undefined, progress: 0.5 }]]), 'lib1');
    expect(got?.position).toBe(500);
  });
});

describe('restoredPatch', () => {
  it('is a paused book at its place, flagged restored, in its chapter', () => {
    const r = { id: 'a', title: 'T', author: 'A', duration: 1000, position: 450, updatedAt: 0 };
    expect(restoredPatch(r, '/cover', chapters)).toMatchObject({
      status: 'paused',
      restored: true,
      position: 450,
      duration: 1000,
      chapterIndex: 1,
      item: { id: 'a', title: 'T', author: 'A', coverUrl: '/cover' },
    });
  });
});

describe('restoredSeek', () => {
  it('moves the place and finds its chapter, clamped to the book', () => {
    expect(restoredSeek(50, 1000, chapters)).toEqual({ position: 50, chapterIndex: 0 });
    expect(restoredSeek(5000, 1000, chapters).position).toBe(1000);
    expect(restoredSeek(-10, 1000, chapters).position).toBe(0);
  });
});

describe('chooseStart', () => {
  it("takes the server's place when nothing was moved here", () => {
    expect(chooseStart(undefined, null, 1234)).toBe(1234);
  });
  it('a move made here since the restore beats the server', () => {
    expect(chooseStart(undefined, 320, 1234)).toBe(320);
  });
  it('a start the caller named outright beats both', () => {
    expect(chooseStart(0, 320, 1234)).toBe(0);
  });
  it('a move to the very start is still a move', () => {
    expect(chooseStart(undefined, 0, 1234)).toBe(0);
  });
});

describe('refreshedPosition', () => {
  const snap = { id: 'a', updatedAt: 1000, movedHere: false };
  const server = { id: 'a', position: 900, lastUpdate: 2000 };
  it('moves to a later place for the same book', () => {
    expect(refreshedPosition(snap, server)).toBe(900);
  });
  it('leaves the snapshot when the server is no newer', () => {
    expect(refreshedPosition(snap, { ...server, lastUpdate: 1000 })).toBeNull();
    expect(refreshedPosition(snap, { ...server, lastUpdate: 500 })).toBeNull();
  });
  it('leaves a place the listener moved here', () => {
    expect(refreshedPosition({ ...snap, movedHere: true }, server)).toBeNull();
  });
  it('ignores another book, a missing record and a finished book', () => {
    expect(refreshedPosition(snap, { ...server, id: 'b' })).toBeNull();
    expect(refreshedPosition(snap, undefined)).toBeNull();
    expect(refreshedPosition(snap, { ...server, isFinished: true })).toBeNull();
  });
  it('an unknown snapshot time (0) is refreshed by any recorded place', () => {
    expect(refreshedPosition({ ...snap, updatedAt: 0 }, server)).toBe(900);
  });
});
