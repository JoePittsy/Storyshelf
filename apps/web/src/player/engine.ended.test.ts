// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Two files: the book ends when the second one does.
const session = {
  id: 's1',
  libraryItemId: 'li_1',
  currentTime: 0,
  duration: 1000,
  playMethod: 0,
  audioTracks: [
    { index: 1, startOffset: 0, duration: 400, contentUrl: '/t/1', mimeType: 'audio/mpeg' },
    { index: 2, startOffset: 400, duration: 600, contentUrl: '/t/2', mimeType: 'audio/mpeg' },
  ],
  chapters: [],
  displayTitle: 'The Book',
  displayAuthor: 'An Author',
};

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  openSession: vi.fn(() => Promise.resolve(session)),
  closeSession: vi.fn(() => Promise.resolve()),
  syncSession: vi.fn(() => Promise.resolve(session)),
  saveProgress: vi.fn(() => Promise.resolve()),
  trackUrl: (_s: unknown, i: number) => `/t/${i}`,
}));

/** An <audio> stand-in whose events the test fires. */
class FakeAudio {
  static last: FakeAudio | null = null;
  paused = true;
  currentTime = 0;
  src = '';
  error = null;
  networkState = 0;
  readyState = 0;
  preload = '';
  defaultPlaybackRate = 1;
  playbackRate = 1;
  ended = false;
  private handlers = new Map<string, (() => void)[]>();
  constructor() {
    FakeAudio.last = this;
  }
  setAttribute() {}
  removeAttribute() {}
  addEventListener(ev: string, cb: () => void) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), cb]);
  }
  fire(ev: string) {
    if (ev === 'ended') {
      this.ended = true;
      this.paused = true;
    }
    this.handlers.get(ev)?.forEach((cb) => cb());
  }
  canPlayType() {
    return 'maybe';
  }
  load() {}
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }
}

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  sessionApi = await import('./session');
  engine = await import('./engine');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const snapshot = () => renderHook(() => engine.usePlayer()).result.current;
const audio = () => {
  if (!FakeAudio.last) throw new Error('no audio element yet');
  return FakeAudio.last;
};

/** Start the book and get it playing in its last file. */
async function playToLastFile() {
  void engine.play('li_1');
  await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
  audio().fire('playing');
  audio().fire('ended'); // the first file: on to the second
  audio().fire('playing');
}

describe('the book ending', () => {
  it('is not ended while the book is under way, nor at the end of a file that is not the last', async () => {
    await playToLastFile();
    expect(audio().src).toBe('/t/2');
    expect(snapshot()).toMatchObject({ status: 'playing', ended: false });
  });

  it('at the end of the last file: paused at the end, marked ended, and the place is synced', async () => {
    await playToLastFile();
    audio().fire('ended');
    expect(snapshot()).toMatchObject({ status: 'paused', ended: true, position: 1000 });
    await vi.waitFor(() => expect(sessionApi.syncSession).toHaveBeenCalled());
  });

  it('tells onBookEnded which book, once the final place has been sent, and reports a save', async () => {
    const ended = vi.fn();
    const saved = vi.fn();
    engine.onBookEnded(ended);
    engine.onProgressSaved(saved);
    await playToLastFile();
    expect(ended).not.toHaveBeenCalled();
    audio().fire('ended');
    await vi.waitFor(() => expect(ended).toHaveBeenCalledWith('li_1'));
    expect(ended).toHaveBeenCalledTimes(1);
    expect(sessionApi.syncSession).toHaveBeenCalled();
    expect(saved).toHaveBeenCalled();
  });

  it('a pause mid-book is not the end', async () => {
    const ended = vi.fn();
    engine.onBookEnded(ended);
    await playToLastFile();
    audio().pause();
    audio().fire('pause');
    expect(snapshot()).toMatchObject({ status: 'paused', ended: false });
    await Promise.resolve();
    expect(ended).not.toHaveBeenCalled();
  });

  it('is no longer ended once it plays again or is moved', async () => {
    await playToLastFile();
    audio().fire('ended');
    engine.seek(500);
    expect(snapshot().ended).toBe(false);
    audio().fire('ended');
    expect(snapshot().ended).toBe(true);
    audio().fire('playing');
    expect(snapshot().ended).toBe(false);
  });

  it('starting another book clears it', async () => {
    await playToLastFile();
    audio().fire('ended');
    void engine.play('li_2');
    expect(snapshot().ended).toBe(false);
  });

  it('stops calling back once unsubscribed', async () => {
    const ended = vi.fn();
    const off = engine.onBookEnded(ended);
    off();
    await playToLastFile();
    audio().fire('ended');
    await vi.waitFor(() => expect(sessionApi.syncSession).toHaveBeenCalled());
    await Promise.resolve();
    expect(ended).not.toHaveBeenCalled();
  });
});
