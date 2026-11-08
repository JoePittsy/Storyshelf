// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const session = {
  id: 's1',
  libraryItemId: 'li_1',
  currentTime: 100,
  duration: 1000,
  playMethod: 0,
  audioTracks: [{ index: 1, startOffset: 0, duration: 1000, contentUrl: '/t/1', mimeType: 'audio/mpeg' }],
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
  trackUrl: () => '/t/1',
}));

class FakeAudio {
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
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  canPlayType() {
    return 'maybe';
  }
  load() {}
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
}

const chapters = [
  { id: 0, start: 0, end: 300, title: 'One' },
  { id: 1, start: 300, end: 1000, title: 'Two' },
];
const book = { id: 'li_1', title: 'The Book', author: 'An Author', duration: 1000, position: 450, updatedAt: 1000 };

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');

beforeEach(async () => {
  localStorage.clear(); // places kept by earlier tests (see places.ts)
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  sessionApi = await import('./session');
  engine = await import('./engine');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** The engine's state, read through its hook. */
const snapshot = () => renderHook(() => engine.usePlayer()).result.current;

describe('restoring the last book', () => {
  it('shows the book paused at its place, and opens no session', () => {
    engine.restore(book, chapters);
    expect(sessionApi.openSession).not.toHaveBeenCalled();
    expect(snapshot()).toMatchObject({
      status: 'paused',
      restored: true,
      position: 450,
      chapterIndex: 1,
      item: { id: 'li_1' },
    });
  });

  it('does nothing once a book is in the player', () => {
    engine.restore(book, chapters);
    engine.restore({ ...book, id: 'other', position: 5 }, chapters);
    expect(snapshot().item?.id).toBe('li_1');
  });

  it('seeks, skips and chapter jumps move the place without a session or audio', () => {
    engine.restore(book, chapters);
    engine.seek(10);
    expect(snapshot()).toMatchObject({ position: 10, chapterIndex: 0, restored: true });
    engine.skip(1);
    expect(snapshot().position).toBe(10 + snapshot().skipForward);
    engine.nextChapter();
    expect(snapshot().position).toBe(300);
    expect(sessionApi.openSession).not.toHaveBeenCalled();
  });

  it('the first toggle opens the session at the place it was moved to, and clears the flag', async () => {
    engine.restore(book, chapters);
    engine.seek(320);
    engine.toggle();
    // play() ran synchronously up to its first await: loading, and not restored any more.
    expect(snapshot()).toMatchObject({ status: 'loading', restored: false });
    await vi.waitFor(() => expect(sessionApi.openSession).toHaveBeenCalledWith('li_1', expect.any(Array)), {
      timeout: 5_000,
    });
    await vi.waitFor(() => expect(snapshot().position).toBe(320), { timeout: 5_000 });
  });

  it("an unmoved restored book starts from the server's place, not the stale snapshot", async () => {
    engine.restore(book, chapters); // snapshot says 450; the server's session says 100
    engine.toggle();
    await vi.waitFor(() => expect(snapshot().position).toBe(100), { timeout: 5_000 });
  });

  it('hero Resume (play with no start) and the mini player agree on that place', async () => {
    engine.restore(book, chapters);
    void engine.play('li_1');
    await vi.waitFor(() => expect(snapshot().position).toBe(100), { timeout: 5_000 });
  });

  it('a move made on the restored book is saved to the server, once, after a short pause', async () => {
    vi.useFakeTimers();
    try {
      engine.restore(book, chapters);
      engine.seek(10);
      engine.seek(320);
      expect(sessionApi.saveProgress).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(600);
      expect(sessionApi.saveProgress).toHaveBeenCalledTimes(1);
      expect(sessionApi.saveProgress).toHaveBeenCalledWith('li_1', 320, 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a refreshed snapshot shows the newer server place, and its chapter', () => {
    engine.restore(book, chapters);
    const progress = new Map([['li_1', { progress: 0.1, currentTime: 100, isFinished: false, lastUpdate: 2000 }]]);
    engine.refreshRestored(progress);
    expect(snapshot()).toMatchObject({ position: 100, chapterIndex: 0, restored: true });
  });

  it('a refresh with nothing newer, or after a local move, changes nothing', () => {
    engine.restore(book, chapters);
    const older = new Map([['li_1', { progress: 0.1, currentTime: 100, isFinished: false, lastUpdate: 1000 }]]);
    engine.refreshRestored(older);
    expect(snapshot().position).toBe(450);
    engine.seek(320);
    const newer = new Map([['li_1', { progress: 0.1, currentTime: 100, isFinished: false, lastUpdate: 9000 }]]);
    engine.refreshRestored(newer);
    expect(snapshot().position).toBe(320);
  });

  it('starting another book behaves as before and drops the restored book', async () => {
    engine.restore(book, chapters);
    void engine.play('li_2');
    expect(snapshot().restored).toBe(false);
    await vi.waitFor(() => expect(sessionApi.openSession).toHaveBeenCalledWith('li_2', expect.any(Array)), {
      timeout: 5_000,
    });
  });
});
