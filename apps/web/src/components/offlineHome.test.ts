import { describe, expect, it } from 'vitest';
import type { DownloadedBook } from '../downloads';
import { downloadLine, fmtSize, jumpBackIn, withPlacesHere } from './offlineHome';

const dl = (itemId: string, over: Partial<DownloadedBook> = {}): DownloadedBook => ({
  itemId,
  libraryId: 'L1',
  title: itemId,
  author: 'A',
  coverUrl: null,
  duration: 3600,
  bytes: 100,
  totalBytes: 100,
  status: 'complete',
  addedAt: 1,
  ...over,
});

describe('jumpBackIn', () => {
  it('offers the download last listened to', () => {
    const progress = new Map([
      ['a', { lastUpdate: 10, currentTime: 5 }],
      ['b', { lastUpdate: 30, currentTime: 9 }],
    ]);
    expect(jumpBackIn([dl('a'), dl('b'), dl('c')], progress)?.itemId).toBe('b');
  });

  it('prefers the book in the player, if it is downloaded', () => {
    const progress = new Map([['b', { lastUpdate: 30 }]]);
    expect(jumpBackIn([dl('a'), dl('b')], progress, 'a')?.itemId).toBe('a');
  });

  it('only offers books on the device in full, and never a finished one', () => {
    const progress = new Map([
      ['a', { lastUpdate: 50, isFinished: true }],
      ['b', { lastUpdate: 40 }],
    ]);
    expect(jumpBackIn([dl('a'), dl('b', { status: 'downloading' }), dl('c')], progress)?.itemId).toBe('c');
    expect(jumpBackIn([dl('b', { status: 'paused' })], progress)).toBeUndefined();
  });

  it('with no listening to go on, offers the newest download', () => {
    expect(jumpBackIn([dl('old', { addedAt: 1 }), dl('new', { addedAt: 9 })], new Map())?.itemId).toBe('new');
  });
});

describe('downloadLine', () => {
  it('says how each download stands, in a few words', () => {
    expect(downloadLine(dl('a', { totalBytes: 312e6 }))).toBe('Downloaded · 312 MB');
    expect(downloadLine(dl('a', { status: 'downloading', bytes: 42, totalBytes: 100 }))).toBe('Downloading 42%');
    expect(downloadLine(dl('a', { status: 'queued' }))).toBe('Waiting to download');
    expect(downloadLine(dl('a', { status: 'paused', bytes: 10, totalBytes: 100, error: 'you left the app' }))).toBe(
      'Paused at 10%: you left the app'
    );
    expect(downloadLine(dl('a', { status: 'failed', error: 'not enough space' }))).toBe(
      "Didn't download: not enough space"
    );
  });
});

describe('fmtSize', () => {
  it('reads in MB, then GB', () => {
    expect(fmtSize(0)).toBe('0 MB');
    expect(fmtSize(400_000)).toBe('1 MB');
    expect(fmtSize(525.6e6)).toBe('526 MB');
    expect(fmtSize(1.44e9)).toBe('1.4 GB');
  });
});

describe('withPlacesHere', () => {
  it('puts this device’s newer place over the server’s, so listening done offline counts', () => {
    const progress = new Map([
      ['a', { lastUpdate: 10, currentTime: 5, isFinished: false }],
      ['b', { lastUpdate: 30, currentTime: 9, isFinished: false }],
    ]);
    const here = new Map([
      ['a', { position: 50, updatedAt: 40 }],
      ['b', { position: 1, updatedAt: 20 }],
    ]);
    const out = withPlacesHere(progress, [dl('a'), dl('b')], (id) => here.get(id));
    expect(out.get('a')).toEqual({ lastUpdate: 40, currentTime: 50, isFinished: false });
    expect(out.get('b')).toEqual({ lastUpdate: 30, currentTime: 9, isFinished: false });
    expect(jumpBackIn([dl('a'), dl('b')], out)?.itemId).toBe('a');
  });
});
