// @vitest-environment jsdom
/**
 * Downloaded books: the player plays their files from the device. Online it still opens a server session (progress,
 * stats and hand-off as for any book); offline it opens none, keeps the listening on the device, and sends it once the
 * server is back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Two files and two chapters: file 1 is 0..400, file 2 is 400..1000.
const chapters = [
  { id: 0, start: 0, end: 300, title: 'One' },
  { id: 1, start: 300, end: 1000, title: 'Two' },
];
const session = {
  id: 's1',
  libraryItemId: 'li_1',
  currentTime: 450,
  duration: 1000,
  playMethod: 0,
  audioTracks: [
    { index: 1, startOffset: 0, duration: 400, contentUrl: '/t/1', mimeType: 'audio/mpeg' },
    { index: 2, startOffset: 400, duration: 600, contentUrl: '/t/2', mimeType: 'audio/mpeg' },
  ],
  chapters,
  displayTitle: 'The Book',
  displayAuthor: 'An Author',
};
const saved = (overrides: { duration2?: number } = {}) => ({
  item: {
    itemId: 'li_1',
    libraryId: 'lib',
    title: 'Saved Title',
    author: 'Saved Author',
    duration: 1000,
    chapters,
    tracks: [
      { index: 1, ino: 'a', filename: '1.mp3', mimeType: 'audio/mpeg', size: 1, startOffset: 0, duration: 400 },
      {
        index: 2,
        ino: 'b',
        filename: '2.mp3',
        mimeType: 'audio/mpeg',
        size: 1,
        startOffset: 400,
        duration: overrides.duration2 ?? 600,
      },
    ],
    updatedAt: 0,
  },
  urls: new Map([
    [1, 'blob:one'],
    [2, 'blob:two'],
  ]),
  cover: 'blob:cover',
});

let now = 1_800_000_000_000;
let perf = 0;

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  openSession: vi.fn(() => Promise.resolve(session)),
  closeSession: vi.fn(() => Promise.resolve()),
  syncSession: vi.fn((s: unknown) => Promise.resolve(s)),
  saveProgress: vi.fn(() => Promise.resolve()),
  trackUrl: (_s: unknown, i: number) => `/t/${i}`,
  ourDeviceId: () => 'dev-here',
}));
vi.mock('./handoffServer', () => ({ serverPlace: vi.fn(), recentSessions: vi.fn(() => Promise.resolve([])) }));
let downloadsChanged: () => void = () => undefined;
vi.mock('./localAudio', () => ({
  onDevice: vi.fn(() => true),
  localBook: vi.fn(),
  coverOnDevice: () => 'blob:cover',
  onDownloadsChanged: (cb: () => void) => {
    downloadsChanged = cb;
    return () => undefined;
  },
}));
vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  absFetch: vi.fn(),
  hasAccessToken: () => true,
}));

/** An <audio> stand-in whose events the test fires. As in a browser, a new src puts currentTime back to 0. */
class FakeAudio {
  static last: FakeAudio | null = null;
  paused = true;
  currentTime = 0;
  private _src = '';
  /** Every src it was pointed at, in order. */
  srcs: string[] = [];
  error = null;
  networkState = 0;
  readyState = 0;
  preload = '';
  defaultPlaybackRate = 1;
  playbackRate = 1;
  volume = 1;
  ended = false;
  private handlers = new Map<string, (() => void)[]>();
  constructor() {
    FakeAudio.last = this;
  }
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    this.srcs.push(v);
    this.currentTime = 0;
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
    if (this.paused) return;
    this.paused = true;
    this.fire('pause');
  }
  play() {
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }
}

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');
let localAudio: typeof import('./localAudio');
let handoffServer: typeof import('./handoffServer');
let auth: typeof import('../api/auth');
let connectivity: typeof import('../api/connectivity');
let queue: typeof import('./localSessions');
let places: typeof import('./places');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  FakeAudio.last = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
  sessionApi = await import('./session');
  localAudio = await import('./localAudio');
  handoffServer = await import('./handoffServer');
  auth = await import('../api/auth');
  connectivity = await import('../api/connectivity');
  queue = await import('./localSessions');
  places = await import('./places');
  engine = await import('./engine');
  vi.mocked(localAudio.onDevice).mockReturnValue(true);
  vi.mocked(localAudio.localBook).mockResolvedValue(saved());
  vi.mocked(handoffServer.serverPlace).mockResolvedValue(null);
});
afterEach(() => {
  connectivity.resetConnectivityForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const snapshot = () => renderHook(() => engine.usePlayer()).result.current;
const audio = () => {
  if (!FakeAudio.last) throw new Error('no audio element yet');
  return FakeAudio.last;
};
/** The element has loaded what it was pointed at (it seeks to the pending offset) and plays. */
function started(a: FakeAudio) {
  a.fire('loadstart');
  a.fire('loadedmetadata');
  a.paused = false;
  a.fire('playing');
}
/** Lets `ms` of playing time pass, the element's clock moving with it. */
function run(a: FakeAudio, ms: number) {
  for (let left = ms; left > 0; left -= 5000) {
    const step = Math.min(5000, left);
    perf += step;
    now += step;
    a.currentTime += step / 1000;
    a.fire('timeupdate');
  }
}
async function opened(from?: number) {
  void engine.play('li_1', from);
  await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
  return audio();
}
const localAllCalls = () => vi.mocked(auth.absFetch).mock.calls.filter(([p]) => p === '/api/session/local-all');

describe('online, a downloaded book', () => {
  it('opens a server session as ever, and plays its files from the device', async () => {
    const a = await opened();
    expect(sessionApi.openSession).toHaveBeenCalledTimes(1);
    expect(a.src).toBe('blob:two');
    started(a);
    expect(a.currentTime).toBe(50);
    run(a, 10_000);
    await vi.waitFor(() => expect(sessionApi.syncSession).toHaveBeenCalled());
    expect(auth.absFetch).not.toHaveBeenCalled();
    expect(snapshot().item?.coverUrl).toContain('/api/items/li_1/cover');
  });

  it('goes on to the next file on the device inside the `ended` handler', async () => {
    vi.mocked(sessionApi.openSession).mockResolvedValueOnce({ ...session, currentTime: 100 });
    const a = await opened();
    expect(a.src).toBe('blob:one');
    started(a);
    a.fire('ended');
    expect(a.src).toBe('blob:two');
    expect(a.paused).toBe(false);
  });

  it('streams when the files on the device are not the server’s', async () => {
    vi.mocked(localAudio.localBook).mockResolvedValue(saved({ duration2: 900 }));
    const a = await opened();
    expect(a.src).toBe('/t/2');
  });

  it('streams a book that is not downloaded', async () => {
    vi.mocked(localAudio.onDevice).mockReturnValue(false);
    const a = await opened();
    expect(a.src).toBe('/t/2');
    expect(localAudio.localBook).not.toHaveBeenCalled();
  });

  it('after a long pause, reloads the file from the device', async () => {
    const a = await opened();
    started(a);
    run(a, 5000);
    a.pause();
    now += 10 * 60_000;
    a.srcs = [];
    engine.toggle();
    expect(a.srcs).toEqual(['blob:two']);
    expect(a.paused).toBe(false);
  });

  it('removed while playing: streams on from the same place', async () => {
    const a = await opened();
    started(a);
    run(a, 5000); // 455: file 2 at 55
    vi.mocked(localAudio.onDevice).mockReturnValue(false);
    downloadsChanged();
    expect(a.src).toBe('/t/2');
    expect(a.paused).toBe(false);
    a.fire('loadedmetadata');
    expect(a.currentTime).toBe(55);
  });

  it('the server unreachable as it opens: plays from the device anyway', async () => {
    vi.mocked(sessionApi.openSession).mockImplementationOnce(() => {
      connectivity.markUnreachable();
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    engine.setProgressLookup(() => ({ currentTime: 450, lastUpdate: now - 1000 }));
    const a = await opened();
    expect(sessionApi.openSession).toHaveBeenCalledTimes(1);
    expect(snapshot().position).toBe(450);
    expect(a.src).toBe('blob:two');
    expect(snapshot()).toMatchObject({ status: 'loading', error: null });
  });

  it('listening kept from offline goes to the server before the book opens a session', async () => {
    queue.recordListening({
      itemId: 'li_1',
      title: 'The Book',
      author: 'An Author',
      duration: 1000,
      startTime: 400,
      currentTime: 480,
      timeListened: 80,
    });
    queue.endListening('li_1');
    const order: string[] = [];
    vi.mocked(auth.absFetch).mockImplementation((_p, init) => {
      order.push('local-all');
      const { sessions } = JSON.parse(String(init?.body)) as { sessions: { id: string }[] };
      return Promise.resolve({ results: sessions.map((s) => ({ id: s.id, success: true, progressSynced: true })) });
    });
    vi.mocked(sessionApi.openSession).mockImplementationOnce(() => {
      order.push('open');
      return Promise.resolve(session);
    });
    await opened();
    expect(order).toEqual(['local-all', 'open']);
  });
});

describe('offline, a downloaded book', () => {
  beforeEach(() => connectivity.markUnreachable());

  it('plays from the device with no server session, and asks the network for nothing', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    vi.stubGlobal('fetch', fetch);
    const a = await opened();
    expect(sessionApi.openSession).not.toHaveBeenCalled();
    expect(snapshot()).toMatchObject({
      item: { id: 'li_1', title: 'Saved Title', author: 'Saved Author', coverUrl: 'blob:cover' },
      duration: 1000,
      chapters,
    });
    expect(a.src).toBe('blob:one'); // nothing known: the beginning
    started(a);
    run(a, 30_000);
    a.pause();
    await engine.checkHandoff('wake');
    expect(fetch).not.toHaveBeenCalled();
    expect(auth.absFetch).not.toHaveBeenCalled();
    expect(sessionApi.syncSession).not.toHaveBeenCalled();
    expect(handoffServer.serverPlace).not.toHaveBeenCalled();
  });

  it('its syncs go in the device’s queue, and its place is kept', async () => {
    const a = await opened(450);
    started(a);
    run(a, 10_000);
    expect(queue.queuedSessions()).toMatchObject([{ libraryItemId: 'li_1', startTime: 450, currentTime: 460 }]);
    run(a, 5000);
    a.pause();
    expect(queue.queuedSessions()).toMatchObject([{ currentTime: 465, timeListening: 15 }]);
    expect(places.placeOf('li_1')?.position).toBe(465);
    expect(auth.absFetch).not.toHaveBeenCalled();
  });

  it('stopping closes its session without asking the server', async () => {
    const a = await opened(450);
    started(a);
    run(a, 10_000);
    await engine.stop();
    expect(sessionApi.closeSession).not.toHaveBeenCalled();
    queue.recordListening({
      itemId: 'li_1',
      title: 'The Book',
      author: 'An Author',
      duration: 1000,
      startTime: 0,
      currentTime: 10,
      timeListened: 1,
    });
    expect(queue.queuedSessions()).toHaveLength(2); // the stopped one was closed
  });

  describe('starts at the newest place known', () => {
    it('this device’s own, when newer than the server’s', async () => {
      places.savePlace('li_1', 700, now - 1000);
      engine.setProgressLookup(() => ({ currentTime: 200, lastUpdate: now - 5000 }));
      const a = await opened();
      expect(snapshot().position).toBe(700);
      expect(a.src).toBe('blob:two');
    });

    it('the server’s last known, when newer', async () => {
      places.savePlace('li_1', 700, now - 5000);
      engine.setProgressLookup(() => ({ currentTime: 200, lastUpdate: now - 1000 }));
      const a = await opened();
      expect(snapshot().position).toBe(200);
      expect(a.src).toBe('blob:one');
    });

    it('a start named outright', async () => {
      places.savePlace('li_1', 700, now - 1000);
      engine.setProgressLookup(() => ({ currentTime: 200, lastUpdate: now - 5000 }));
      await opened(350);
      expect(snapshot().position).toBe(350);
    });

    it('a restored book left a while ago goes back a little, as online', async () => {
      places.savePlace('li_1', 700, now - 60 * 60_000);
      engine.restore({ id: 'li_1', title: 'T', author: 'A', duration: 1000, position: 650, updatedAt: 1 }, chapters);
      expect(snapshot().position).toBe(700); // the device's place is the later one
      await opened();
      expect(snapshot().position).toBeLessThan(700);
      expect(snapshot().position).toBeGreaterThanOrEqual(670);
    });
  });

  it('a book restored on a launch offline shows the cover saved with it', () => {
    engine.restore({ id: 'li_1', title: 'T', author: 'A', duration: 1000, position: 650, updatedAt: 1 }, chapters);
    expect(snapshot().item?.coverUrl).toBe('blob:cover');
  });

  it('after a long pause, reloads the file from the device', async () => {
    const a = await opened(450);
    started(a);
    run(a, 5000);
    a.pause();
    now += 10 * 60_000;
    a.srcs = [];
    engine.toggle();
    expect(a.srcs).toEqual(['blob:two']);
  });

  it('removed while playing: stops, and goes back in the player paused where it was', async () => {
    const a = await opened(450);
    started(a);
    run(a, 10_000);
    vi.mocked(localAudio.onDevice).mockReturnValue(false);
    downloadsChanged();
    await vi.waitFor(() => expect(snapshot()).toMatchObject({ restored: true, status: 'paused', position: 460 }));
    expect(a.paused).toBe(true);
    // Play now says why it can't.
    const told = vi.fn();
    engine.onOfflinePlay(told);
    await engine.play('li_1');
    expect(told).toHaveBeenCalledTimes(1);
  });
});

describe('offline, a book that is not downloaded', () => {
  it('opens nothing and says why, in words that know about downloads', async () => {
    connectivity.markUnreachable();
    vi.mocked(localAudio.onDevice).mockReturnValue(false);
    const told = vi.fn();
    engine.onOfflinePlay(told);
    await engine.play('li_1');
    expect(told).toHaveBeenCalledTimes(1);
    expect(sessionApi.openSession).not.toHaveBeenCalled();
    expect(engine.MSG_OFFLINE).toBe("You're offline. Download a book to listen with no connection.");
  });

  it('a streamed book paused when the connection went: Play says why rather than failing', async () => {
    vi.mocked(localAudio.onDevice).mockReturnValue(false);
    const a = await opened();
    started(a);
    a.pause();
    connectivity.markUnreachable();
    const told = vi.fn();
    engine.onOfflinePlay(told);
    engine.toggle();
    expect(told).toHaveBeenCalledTimes(1);
    expect(a.paused).toBe(true);
    expect(snapshot().error).toBeNull();
  });
});

describe('back online after listening offline', () => {
  const accept = (progressSynced: boolean) =>
    vi.mocked(auth.absFetch).mockImplementation((_p, init) => {
      const { sessions } = JSON.parse(String(init?.body)) as { sessions: { id: string }[] };
      return Promise.resolve({ results: sessions.map((s) => ({ id: s.id, success: true, progressSynced })) });
    });

  it('a newer place another device wrote meanwhile is offered, not overwritten unasked', async () => {
    connectivity.markUnreachable();
    accept(true);
    const a = await opened(450);
    started(a);
    run(a, 10_000);
    a.pause();
    vi.mocked(handoffServer.serverPlace).mockResolvedValue({ currentTime: 900, lastUpdate: now, isFinished: false });
    connectivity.markReachable();
    await queue.flushListening();
    expect(snapshot().handoff).toMatchObject({ itemId: 'li_1', position: 900 });
    expect(snapshot().position).toBe(460);
    // Asked first, then sent.
    expect(handoffServer.serverPlace).toHaveBeenCalled();
    expect(localAllCalls()).toHaveLength(1);
  });

  it('with nothing newer elsewhere, the place is sent and nothing is offered', async () => {
    connectivity.markUnreachable();
    accept(true);
    const a = await opened(450);
    started(a);
    run(a, 10_000);
    a.pause();
    vi.mocked(handoffServer.serverPlace).mockResolvedValue({ currentTime: 450, lastUpdate: 0, isFinished: false });
    connectivity.markReachable();
    await queue.flushListening();
    expect(snapshot().handoff).toBeNull();
    const body = JSON.parse(String(localAllCalls()[0][1]?.body)) as { sessions: { currentTime: number }[] };
    expect(body.sessions[0].currentTime).toBe(460);
  });

  it('the server keeping a newer place (progress not synced) asks, and offers it', async () => {
    connectivity.markUnreachable();
    accept(false);
    const a = await opened(450);
    started(a);
    run(a, 10_000);
    a.pause();
    // At the first check, nothing newer; by the time the listening lands, another device has moved on.
    vi.mocked(handoffServer.serverPlace).mockResolvedValueOnce(null);
    connectivity.markReachable();
    vi.mocked(handoffServer.serverPlace).mockResolvedValue({ currentTime: 50, lastUpdate: now, isFinished: false });
    await queue.flushListening();
    await vi.waitFor(() => expect(snapshot().handoff).toMatchObject({ position: 50 }));
  });
});
