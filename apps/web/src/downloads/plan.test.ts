import { describe, expect, it } from 'vitest';
import {
  ChangedError,
  HttpError,
  SPACE_MARGIN,
  WHY,
  canDownload,
  classify,
  fileDownloadPath,
  fmtBytes,
  percentOf,
  readReply,
  resumePlan,
  spaceCheck,
  trackFile,
} from './plan';

describe('download plan', () => {
  it('uses the per-file download that checks the permission', () => {
    expect(fileDownloadPath('li 1', '42')).toBe('/api/items/li%201/file/42/download');
  });

  it('resumes with a Range, appends a 206 and restarts on a 200', () => {
    expect(resumePlan(0, 10)).toEqual({ range: null, offset: 0, complete: false });
    const plan = resumePlan(4, 10);
    expect(plan).toEqual({ range: 'bytes=4-', offset: 4, complete: false });
    expect(readReply(206, plan)).toEqual({ kind: 'append', offset: 4 });
    expect(readReply(200, plan)).toEqual({ kind: 'restart' });
    expect(resumePlan(10, 10).complete).toBe(true);
  });

  it('checks the book fits in what the device reports, with room to spare', () => {
    const est = { quota: 1e9, usage: 4e8 };
    expect(spaceCheck(6e8 - SPACE_MARGIN, est)).toEqual({ ok: true });
    expect(spaceCheck(6e8, est)).toEqual({ ok: false, free: 6e8 });
    // No estimate: allowed, and the write says if it doesn't fit.
    expect(spaceCheck(1e12, null)).toEqual({ ok: true });
    expect(spaceCheck(1e12, {})).toEqual({ ok: true });
  });

  it('follows ABS on who may download', () => {
    expect(canDownload({ permissions: { download: true } })).toBe(true);
    expect(canDownload({ permissions: { download: false } })).toBe(false);
    expect(canDownload({})).toBe(false);
    expect(canDownload(null)).toBe(false);
  });

  it('names files by inode with a safe extension', () => {
    expect(trackFile({ ino: '123', filename: 'Book One.m4b' })).toBe('123.m4b');
    expect(trackFile({ ino: '7', filename: 'noext' })).toBe('7.noext');
    expect(trackFile({ ino: '7', filename: 'x.' })).toBe('7.bin');
  });

  it('formats sizes and percentages for the listener', () => {
    expect(fmtBytes(0)).toBe('0 MB');
    expect(fmtBytes(12_345)).toBe('1 MB');
    expect(fmtBytes(525e6)).toBe('525 MB');
    expect(fmtBytes(1.44e9)).toBe('1.4 GB');
    expect(percentOf(42, 100)).toBe(42);
    expect(percentOf(100, 100)).toBe(99);
    expect(percentOf(1, 0)).toBe(0);
  });

  it('retries what a better connection fixes and stops on what it doesn’t', () => {
    expect(classify(new TypeError('Load failed'))).toEqual({ kind: 'retry' });
    expect(classify(new HttpError(503))).toEqual({ kind: 'retry' });
    expect(classify(new HttpError(403))).toEqual({ kind: 'fatal', why: WHY.noPermission });
    expect(classify(new HttpError(404))).toEqual({ kind: 'fatal', why: WHY.gone });
    expect(classify(new ChangedError())).toEqual({ kind: 'fatal', why: WHY.changed });
    expect(classify(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toEqual({
      kind: 'fatal',
      why: WHY.full,
    });
    expect(classify(Object.assign(new Error('Session expired'), { name: 'AbsError', status: 401 }))).toEqual({
      kind: 'fatal',
      why: WHY.signedOut,
    });
  });
});
