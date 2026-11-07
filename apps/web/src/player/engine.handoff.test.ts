// @vitest-environment jsdom
// Device hand-off: another device has moved the book on (or back) while this player sat paused with its old place.
// Whatever happens next here (Play, a sync, a close), the old place must not be sent over the newer one unless the
// listener chose it. While this player is playing, it wins, and says another device was playing too.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Two files and two chapters: file 1 is 0..400, file 2 is 400..1000.
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
  chapters: [
    { id: 0, start: 0, end: 300, title: 'One' },
    { id: 1, start: 300, end: 1000, title: 'Two' },
  ],
  displayTitle: 'The Book',
  displayAuthor: 'An Author',
};

let now = 1_000_000_000_000;
// Each test's sessions carry its number: engines from earlier tests are still loaded (and still hear document events), and
// the fake server ignores them.
let run_ = 0;
const ours = (s: unknown) => (s as { id: string }).id.endsWith(`#${run_}`);
let perf = 0;

/** ABS's progress record for li_1, as far as these tests need it. Our syncs and closes write it, and so does "the iPhone". */
let server: { currentTime: number; lastUpdate: number } | null;
/** Every place this player sends, in order. */
let sent: number[] = [];

const write = (t: number) => {
  sent.push(Math.round(t));
  server = { currentTime: t, lastUpdate: now };
};
/** Another device writes a place. */
const elsewhere = (t: number) => {
  now += 1000;
  server = { currentTime: t, lastUpdate: now };
  now += 1000;
};

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  openSession: vi.fn((id: string) => Promise.resolve({ ...session, libraryItemId: id, id: `s-${id}#${run_}` })),
  closeSession: vi.fn((s: unknown, p?: { currentTime: number }) => {
    if (p && ours(s)) write(p.currentTime);
    return Promise.resolve();
  }),
  syncSession: vi.fn(),
  saveProgress: vi.fn(() => Promise.resolve()),
  trackUrl: (_s: unknown, i: number) => `/t/${i}`,
  ourDeviceId: () => 'dev-here',
}));

vi.mock('./handoffServer', () => ({ serverPlace: vi.fn(), recentSessions: vi.fn() }));

/** An <audio> stand-in whose events the test fires. As in a browser, a new src puts currentTime back to 0. */
class FakeAudio {
  static last: FakeAudio | null = null;
  paused = true;
  currentTime = 0;
  private _src = '';
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
    this.currentTime = 0;
  }
  setAttribute() {}
  removeAttribute() {}
  addEventListener(ev: string, cb: () => void) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), cb]);
  }
  fire(ev: string) {
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
    return Promise.resolve();
  }
}

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');
let handoffServer: typeof import('./handoffServer');
let jumpLog: typeof import('./jumpLog');
let notices: unknown[] = [];

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  run_++;
  sent = [];
  notices = [];
  server = { currentTime: 450, lastUpdate: now - 60_000 };
  FakeAudio.last = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
  sessionApi = await import('./session');
  handoffServer = await import('./handoffServer');
  jumpLog = await import('./jumpLog');
  engine = await import('./engine');
  engine.onHandoffNotice((n) => notices.push(n));
  // A test may change these; every test starts from the plain fake.
  vi.mocked(handoffServer.serverPlace).mockImplementation(() => Promise.resolve(server && { ...server, isFinished: false }));
  vi.mocked(handoffServer.recentSessions).mockImplementation(() => Promise.resolve([]));
  vi.mocked(sessionApi.syncSession).mockImplementation((s, p) => {
    if (ours(s)) write(p.currentTime);
    return Promise.resolve(s);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const snapshot = () => renderHook(() => engine.usePlayer()).result.current;
const audio = () => {
  if (!FakeAudio.last) throw new Error('no audio element yet');
  return FakeAudio.last;
};
/** Lets `ms` of playing time pass, the element's clock moving with it, in the steps `timeupdate` really comes in. */
function run(a: FakeAudio, ms: number) {
  for (let left = ms; left > 0; left -= 5000) {
    const step = Math.min(5000, left);
    perf += step;
    a.currentTime += step / 1000;
    a.fire('timeupdate');
  }
}
/** The element has loaded what it was pointed at (it seeks to the pending offset) and plays. */
function started(a: FakeAudio) {
  a.fire('loadedmetadata');
  a.paused = false;
  a.fire('playing');
}
const marks = (id = 'li_1') => renderHook(() => jumpLog.useJumpMarks(id)).result.current;

/** Plays li_1 from the server's place (450: file 2 at 50). */
async function playing() {
  void engine.play('li_1');
  await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
  const a = audio();
  started(a);
  expect(a.currentTime).toBe(50);
  return a;
}

/** Listens a second, pauses (the pause syncs), then lets `ms` of real time pass. */
async function pauseFor(a: FakeAudio, ms: number) {
  perf += 1000;
  a.pause();
  await vi.waitFor(() => expect(snapshot().status).toBe('paused'));
  await vi.waitFor(() => expect(sent).toEqual([450]));
  now += ms;
}

describe('found while paused: offered, not jumped to', () => {
  it('a check while paused shows the newer place, and leaves this one where it is', async () => {
    const a = await playing();
    await pauseFor(a, 60 * 60_000);
    elsewhere(900);
    await engine.checkHandoff('wake');
    expect(snapshot().handoff).toMatchObject({ itemId: 'li_1', position: 900 });
    expect(snapshot().position).toBe(450);
    expect(sent).toEqual([450]);
  });

  it('names the device from the session that wrote it', async () => {
    vi.mocked(handoffServer.recentSessions).mockImplementation(() =>
      Promise.resolve([
        { id: 'x', libraryItemId: 'li_1', updatedAt: server!.lastUpdate, deviceInfo: { deviceId: 'phone', model: 'iPhone' } },
      ] as never),
    );
    const a = await playing();
    await pauseFor(a, 60_000);
    elsewhere(900);
    await engine.checkHandoff('wake');
    expect(snapshot().handoff?.device).toEqual({ name: 'iPhone', sameBrowser: false });
  });

  it('nothing newer: no offer (our own pause sync is not another device)', async () => {
    const a = await playing();
    await pauseFor(a, 60_000);
    await engine.checkHandoff('wake');
    expect(snapshot().handoff).toBeNull();
  });

  it('Play takes the newer place inside the click, before any audio, and says so (for an Undo)', async () => {
    const a = await playing();
    await pauseFor(a, 60 * 60_000);
    elsewhere(900);
    await engine.checkHandoff('wake');
    engine.toggle();
    expect(snapshot().position).toBe(900);
    expect(a.currentTime).toBe(500); // file 2 at 500: no rewind on top of the other device's place
    expect(snapshot().handoff).toBeNull();
    expect(notices).toEqual([expect.objectContaining({ kind: 'adopted', itemId: 'li_1', from: 450, to: 900 })]);
    started(a);
    run(a, 11_000);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(1));
    expect(sent.slice(1).every((t) => t >= 900)).toBe(true);
  });

  it('a check that began before a move the listener made is out of date, and offers nothing', async () => {
    const a = await playing();
    await pauseFor(a, 60_000);
    elsewhere(900);
    let answer!: () => void;
    vi.mocked(handoffServer.serverPlace).mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve({ currentTime: 900, lastUpdate: now - 1000, isFinished: false }))),
    );
    const check = engine.checkHandoff('wake');
    engine.seek(300);
    answer();
    await check;
    expect(snapshot().handoff).toBeNull();
    expect(snapshot().position).toBe(300);
  });
});

describe('the first sync after a pause can never send the stale place over a newer one', () => {
  it('Play after a long pause, before any check: the newer place is taken, and only it is sent', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60 * 60_000);
    elsewhere(900);
    engine.toggle(); // nothing has checked yet: this plays here at once (the rewind takes it to 420) while it checks
    started(a);
    await vi.waitFor(() => expect(snapshot().position).toBe(900));
    run(a, 11_000);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(1));
    expect(sent.slice(1).every((t) => t >= 900)).toBe(true);
    expect(server?.currentTime).toBeGreaterThanOrEqual(900);
    expect(notices).toEqual([expect.objectContaining({ kind: 'adopted', from: 420, to: 900 })]);
  });

  it('Play with nothing newer elsewhere: carries on from here, rewind and all, and syncs as usual', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60 * 60_000);
    engine.toggle();
    started(a);
    run(a, 11_000);
    await vi.waitFor(() => expect(sent.length).toBe(2));
    expect(sent[1]).toBe(431); // 420 after the 30 s rewind and 11 s of listening: the held sync sends the place as it is when it goes
    expect(notices).toEqual([]);
  });

  it("a check that can't reach the server doesn't hold the syncs back for ever once playing", async () => {
    const a = await playing();
    await pauseFor(a, 60_000);
    vi.mocked(handoffServer.serverPlace).mockRejectedValue(new TypeError('offline'));
    engine.toggle();
    started(a);
    run(a, 11_000);
    await vi.waitFor(() => expect(sent.length).toBe(2));
  });

  it('a sync that comes due while paused (a failed pause sync, then the tab hides) is dropped when another device is newer', async () => {
    const a = await playing();
    vi.mocked(sessionApi.syncSession).mockRejectedValueOnce(new TypeError('offline'));
    perf += 1000;
    a.pause(); // this sync fails: the listened second is kept for the next one
    await vi.waitFor(() => expect(sessionApi.syncSession).toHaveBeenCalledTimes(1));
    now += 60 * 60_000;
    elsewhere(900);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.waitFor(() => expect(snapshot().handoff?.position).toBe(900));
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    }
    expect(sent).toEqual([]);
    expect(server?.currentTime).toBe(900);
  });

  it('switching to another book while the newer place is on offer closes this one without its stale place', async () => {
    const a = await playing();
    await pauseFor(a, 60_000);
    elsewhere(900);
    await engine.checkHandoff('wake');
    void engine.play('li_2');
    await vi.waitFor(() => expect(sessionApi.closeSession).toHaveBeenCalled());
    expect(vi.mocked(sessionApi.closeSession).mock.calls[0][1]).toBeUndefined();
    expect(server?.currentTime).toBe(900);
  });

  it('stopping (or a release before a progress change) after a pause sends no unchecked place either', async () => {
    const a = await playing();
    await pauseFor(a, 60_000);
    elsewhere(900);
    await engine.stop();
    expect(vi.mocked(sessionApi.closeSession).mock.calls[0][1]).toBeUndefined();
    expect(server?.currentTime).toBe(900);
  });

  it("a move made while the offer shows is the listener's choice: it is sent, and the other place is kept in History", async () => {
    const a = await playing();
    await pauseFor(a, 60_000);
    elsewhere(900);
    await engine.checkHandoff('wake');
    engine.seek(300);
    expect(snapshot().handoff).toBeNull();
    await vi.waitFor(() => expect(sent).toEqual([450, 300]));
    expect(marks().map((m) => m.position)).toContain(900);
  });

  it('a seek into another file while paused sends the place it moved to, not the start of that file', async () => {
    const a = await playing();
    await pauseFor(a, 1000);
    engine.seek(100); // file 1: the element starts loading it, its clock at 0 until the metadata is in
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toBe(100);
  });
});

describe('while this device plays, it wins', () => {
  it('another device writing is a conflict: no jump, a notice, and our place goes on being sent', async () => {
    const a = await playing();
    run(a, 11_000);
    await vi.waitFor(() => expect(sent).toEqual([460]));
    elsewhere(900);
    await engine.checkHandoff('tick');
    expect(snapshot()).toMatchObject({ status: 'playing', handoff: null });
    expect(snapshot().position).toBeCloseTo(461, 0); // the sync went at 460; a second more has played
    expect(notices).toEqual([expect.objectContaining({ kind: 'conflict', itemId: 'li_1', at: 900 })]);
    run(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toBe(471);
  });

  it('says so once, not at every check', async () => {
    const a = await playing();
    run(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    elsewhere(900);
    await engine.checkHandoff('tick');
    elsewhere(910);
    await engine.checkHandoff('tick');
    expect(notices).toHaveLength(1);
  });
});
