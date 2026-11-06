// @vitest-environment jsdom
/** REQ-45: the progress bar mode is remembered on this device; Book by default; storage failures are survivable. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseProgressMode, loadProgressMode, reloadProgressMode } from './progressMode';

afterEach(() => {
  localStorage.clear();
  reloadProgressMode();
  vi.restoreAllMocks();
});

describe('REQ-45: progress mode memory', () => {
  it('defaults to Book', () => {
    expect(loadProgressMode()).toEqual({ mode: 'book', last: 'book' });
  });
  it('remembers the choice and the last non-Sleep one', () => {
    chooseProgressMode('chapter');
    chooseProgressMode('sleep');
    expect(loadProgressMode()).toEqual({ mode: 'sleep', last: 'chapter' });
  });
  it('ignores junk in storage', () => {
    localStorage.setItem('storyshelf.progressMode', '{"mode":"nope","last":"sleep"}');
    expect(loadProgressMode()).toEqual({ mode: 'book', last: 'book' });
  });
  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadProgressMode().mode).toBe('book');
    expect(() => chooseProgressMode('chapter')).not.toThrow();
  });
});
