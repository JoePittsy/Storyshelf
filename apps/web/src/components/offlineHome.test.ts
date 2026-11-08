import { describe, expect, it } from 'vitest';
import type { DownloadedBook } from '../downloads';
import { downloadLine, jumpBackIn } from './offlineHome';

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
