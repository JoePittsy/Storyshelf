// @vitest-environment jsdom
/**
 * The player offline: apps/web/src/player/engine.ts with api/connectivity.ts.
 * Play for a book that can't open says why, once, and leaves the player as it was (a restored book stays put).
 */
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

const book = { id: 'li_1', title: 'The Book', author: 'An Author', duration: 1000, position: 450, updatedAt: 1000 };

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');
let connectivity: typeof import('../api/connectivity');

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  sessionApi = await import('./session');
  connectivity = await import('../api/connectivity');
  engine = await import('./engine');
});
afterEach(() => {
  connectivity.resetConnectivityForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const snapshot = () => renderHook(() => engine.usePlayer()).result.current;

describe('Play while offline', () => {
  it('opens nothing, says why, and leaves a restored book where it was', async () => {
    engine.restore(book, []);
    connectivity.markUnreachable();
    const told = vi.fn();
    engine.onOfflinePlay(told);
    await engine.play('li_1');
    expect(sessionApi.openSession).not.toHaveBeenCalled();
    expect(told).toHaveBeenCalledTimes(1);
    expect(snapshot()).toMatchObject({ status: 'paused', restored: true, position: 450, error: null });
  });

  it('asks the server again at once, in case the browser had it wrong', async () => {
    const probe = vi.fn(() => Promise.resolve());
    const stop = connectivity.startConnectivity(probe);
    connectivity.markUnreachable();
    await engine.play('li_1');
    expect(probe).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a book whose opening finds the server gone says the app is offline', async () => {
    vi.mocked(sessionApi.openSession).mockImplementationOnce(() => {
      connectivity.markUnreachable(); // as absFetch does on a network failure
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    await engine.play('li_1');
    expect(snapshot()).toMatchObject({ status: 'error', error: engine.MSG_OFFLINE });
  });

  it('online, plays as before', async () => {
    await engine.play('li_1');
    expect(sessionApi.openSession).toHaveBeenCalledTimes(1);
  });
});
