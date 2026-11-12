// @vitest-environment jsdom
// A book finished on another device while this one is still on it. The same account plays one book on two devices; one
// plays it to the end (the server's record becomes `currentTime` = duration, `isFinished`), and the other, at an earlier
// place, carries on. ABS un-finishes a finished record whenever a sync moves `currentTime` away from the end, so the
// other device's next routine sync would put the book back in Continue listening at an old place. It must not: it holds
// back, says so, and sends again only when the listener chooses to carry on from here.
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
let run_ = 0;
const ours = (s: unknown) => (s as { id: string }).id.endsWith(`#${run_}`);
let perf = 0;

interface Record_ {
  currentTime: number;
  lastUpdate: number;
  isFinished: boolean;
}
/** ABS's progress record for li_1. Our syncs and closes write it, and so does "the iPhone". */
let server: Record_ | null;
/** Every place this player sends, in order. */
let sent: number[] = [];

/** ABS's rule (MediaProgress.applyProgressUpdate): within 10 s of the end the book is finished, and a place anywhere else un-finishes it. */
const write = (t: number) => {
  sent.push(Math.round(t));
  server = { currentTime: t, lastUpdate: now + 1, isFinished: session.duration - t < 10 }; // stamped just after it was sent
};
/** Another device plays the book to its end. */
const phoneFinishes = () => {
  now += 1000;
  server = { currentTime: session.duration, lastUpdate: now, isFinished: true };
  now += 1000;
};

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  // ABS opens a finished book at the start.
  openSession: vi.fn((id: string) =>
    Promise.resolve({
      ...session,
      libraryItemId: id,
      id: `s-${id}#${run_}`,
      currentTime: server?.isFinished ? 0 : session.currentTime,
    })
  ),
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
let notices: { kind: string; device?: unknown }[] = [];

const iPhoneSession = () =>
  [
    {
      id: 'x',
      libraryItemId: 'li_1',
      updatedAt: server!.lastUpdate,
      currentTime: server!.currentTime,
      deviceInfo: { deviceId: 'phone', model: 'iPhone' },
    },
  ] as never;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  run_++;
  sent = [];
  notices = [];
  server = { currentTime: 450, lastUpdate: now - 60_000, isFinished: false };
  FakeAudio.last = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
  sessionApi = await import('./session');
  handoffServer = await import('./handoffServer');
  engine = await import('./engine');
  engine.onHandoffNotice((n) => notices.push(n));
  vi.mocked(handoffServer.serverPlace).mockImplementation(() => Promise.resolve(server && { ...server }));
  vi.mocked(handoffServer.recentSessions).mockImplementation(() => Promise.resolve(iPhoneSession()));
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
function listen(a: FakeAudio, ms: number) {
  for (let left = ms; left > 0; left -= 5000) {
    const step = Math.min(5000, left);
    perf += step;
    now += step;
    a.currentTime += step / 1000;
    a.fire('timeupdate');
  }
}
function started(a: FakeAudio) {
  a.fire('loadedmetadata');
  a.paused = false;
  a.fire('playing');
}
/** Plays li_1 from the server's place. */
async function playing() {
  void engine.play('li_1');
  await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
  const a = audio();
  started(a);
  return a;
}
/** The book has played to the end of its last file. */
function reachEnd(a: FakeAudio) {
  a.currentTime = 600;
  a.ended = true;
  a.paused = true;
  a.fire('ended');
}
const finishedHeld = () => snapshot().finishedElsewhere ?? null;

describe('another device finishes the book while this one plays on', () => {
  it("this device's routine sync does not un-finish it: the finish stands on the server", async () => {
    const a = await playing(); // 450 (file 2 at 50)
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1)); // an ordinary sync: nothing has happened elsewhere
    phoneFinishes();
    listen(a, 11_000); // the routine sync comes due
    await vi.waitFor(() => expect(finishedHeld()).not.toBeNull());
    listen(a, 22_000);
    expect(sent).toHaveLength(1);
    expect(server).toMatchObject({ currentTime: 1000, isFinished: true });
  });

  it('the listener is told, naming the device, and playback is not cut off', async () => {
    const a = await playing();
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    phoneFinishes();
    listen(a, 11_000);
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toEqual({ kind: 'finished', itemId: 'li_1', device: { name: 'iPhone', sameBrowser: false } });
    expect(snapshot()).toMatchObject({
      status: 'playing',
      finishedElsewhere: { itemId: 'li_1', device: { name: 'iPhone' } },
    });
    listen(a, 30_000); // later syncs find it held: said once
    expect(notices).toHaveLength(1);
  });

  it('a pause, a book change and a stop send nothing for it either', async () => {
    const a = await playing();
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    phoneFinishes();
    listen(a, 11_000);
    await vi.waitFor(() => expect(finishedHeld()).not.toBeNull());
    perf += 1000;
    a.pause();
    await vi.waitFor(() => expect(snapshot().status).toBe('paused'));
    await engine.stop();
    expect(sent).toHaveLength(1);
    expect(vi.mocked(sessionApi.closeSession).mock.calls.at(-1)?.[1]).toBeUndefined();
    expect(server).toMatchObject({ currentTime: 1000, isFinished: true });
    expect(finishedHeld()).toBeNull(); // nothing is loaded now
  });

  it('a close that no check has covered looks first, and drops its place when a finish is there', async () => {
    const a = await playing();
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    phoneFinishes();
    now += 10_000; // the guard before the next sync has not run yet: the player has not heard
    expect(finishedHeld()).toBeNull();
    await engine.stop();
    expect(vi.mocked(sessionApi.closeSession).mock.calls.at(-1)?.[1]).toBeUndefined();
    expect(server).toMatchObject({ currentTime: 1000, isFinished: true });
  });

  it('paused when it happens: pressing Play does not un-finish it either, and says so', async () => {
    const a = await playing();
    perf += 1000;
    a.pause();
    await vi.waitFor(() => expect(sent).toEqual([450]));
    now += 60 * 60_000;
    phoneFinishes();
    engine.toggle(); // the player has not heard: it plays, and asks
    started(a);
    await vi.waitFor(() => expect(finishedHeld()).not.toBeNull());
    listen(a, 22_000);
    expect(sent).toEqual([450]);
    expect(server).toMatchObject({ currentTime: 1000, isFinished: true });
    await vi.waitFor(() => expect(notices).toHaveLength(1));
  });

  it('a periodic check finds it before any sync does, and the offer says whose it was', async () => {
    const a = await playing();
    phoneFinishes();
    await engine.checkHandoff('tick');
    expect(finishedHeld()).toMatchObject({ itemId: 'li_1' });
    await vi.waitFor(() => expect(notices).toHaveLength(1));
    listen(a, 11_000);
    expect(sent).toEqual([]);
  });

  it('a check while paused changes nothing (nothing is being sent), and Play asks again', async () => {
    const a = await playing();
    perf += 1000;
    a.pause();
    await vi.waitFor(() => expect(sent).toEqual([450]));
    phoneFinishes();
    await engine.checkHandoff('wake');
    expect(finishedHeld()).toBeNull();
    expect(snapshot().handoff).toBeNull(); // a finish is never offered as a place to jump to
    expect(notices).toEqual([]);
  });
});

describe("carrying on from here is the listener's choice", () => {
  it('sends this place, which un-finishes the book, and syncs as usual afterwards', async () => {
    const a = await playing();
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    phoneFinishes();
    listen(a, 11_000);
    await vi.waitFor(() => expect(finishedHeld()).not.toBeNull());
    engine.carryOnHere();
    expect(finishedHeld()).toBeNull();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toBe(472); // the place as it is now (49 s after the open), with the listening held back meanwhile
    expect(server).toMatchObject({ currentTime: 472, isFinished: false });
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(notices).toHaveLength(1);
  });

  it('does nothing when no finish is being held', async () => {
    await playing();
    engine.carryOnHere();
    expect(sent).toEqual([]);
  });

  it('a seek is not an answer: the finish still stands', async () => {
    const a = await playing();
    phoneFinishes();
    await engine.checkHandoff('tick');
    expect(finishedHeld()).not.toBeNull();
    engine.seek(200);
    listen(a, 22_000);
    expect(sent).toEqual([]);
    expect(finishedHeld()).not.toBeNull();
  });

  it('the book started again elsewhere (not finished any more): nothing to hold back', async () => {
    const a = await playing();
    phoneFinishes();
    await engine.checkHandoff('tick');
    expect(finishedHeld()).not.toBeNull();
    now += 1000;
    server = { currentTime: 0, lastUpdate: now, isFinished: false }; // "Mark as not finished" on the iPhone
    now += 1000;
    await engine.checkHandoff('tick');
    expect(finishedHeld()).toBeNull();
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
  });
});

describe("the device's own finish, and listening to a finished book again, keep working", () => {
  it("its own finish is sent at the end, and is not taken for another device's", async () => {
    const a = await playing();
    reachEnd(a);
    await vi.waitFor(() => expect(sent).toEqual([1000]));
    expect(server).toMatchObject({ currentTime: 1000, isFinished: true });
    expect(finishedHeld()).toBeNull();
    expect(notices).toEqual([]);
    expect(snapshot().ended).toBe(true);
  });

  it('reaching the end after being told is still sent: it keeps the finish, and the offer goes', async () => {
    const a = await playing();
    phoneFinishes();
    await engine.checkHandoff('tick');
    expect(finishedHeld()).not.toBeNull();
    reachEnd(a);
    expect(finishedHeld()).toBeNull();
    await vi.waitFor(() => expect(sent).toEqual([1000]));
    expect(server).toMatchObject({ currentTime: 1000, isFinished: true });
  });

  it('after its own finish, going back and listening again sends the places it moves to', async () => {
    const a = await playing();
    reachEnd(a);
    await vi.waitFor(() => expect(sent).toEqual([1000]));
    void engine.play('li_1', 100); // "Play again" from a place: the same session, moved
    started(a);
    now += 10_000;
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(1));
    expect(sent.at(-1)).toBeLessThan(500);
    expect(server?.isFinished).toBe(false);
    expect(finishedHeld()).toBeNull();
    expect(notices).toEqual([]);
  });

  it('a book finished before Play was pressed: playing it again sends its places and un-finishes it', async () => {
    server = { currentTime: 1000, lastUpdate: now - 3 * 60 * 60_000, isFinished: true };
    const a = await playing(); // ABS opens it at the start
    expect(snapshot().position).toBe(0);
    now += 10_000;
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toBe(10);
    expect(server).toMatchObject({ currentTime: 10, isFinished: false });
    expect(finishedHeld()).toBeNull();
    expect(notices).toEqual([]);
  });

  it('the same, started from "Play again" at a chosen place on a finished book', async () => {
    server = { currentTime: 1000, lastUpdate: now - 60_000, isFinished: true };
    void engine.play('li_1', 300);
    await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
    const a = audio();
    started(a);
    now += 10_000;
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toBeGreaterThanOrEqual(300);
    expect(server?.isFinished).toBe(false);
    expect(notices).toEqual([]);
  });
});

describe('what asking costs', () => {
  it("a routine sync reads the server's place once, and a sync right after a read does not read again", async () => {
    const a = await playing();
    const reads = () => vi.mocked(handoffServer.serverPlace).mock.calls.length;
    listen(a, 10_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(reads()).toBe(1);
    listen(a, 10_000);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(reads()).toBe(2);
    await engine.checkHandoff('tick'); // a check reads it too
    expect(reads()).toBe(3);
    perf += 1000;
    a.pause(); // the pause sync comes straight after that read: it doesn't read again
    await vi.waitFor(() => expect(sent).toHaveLength(3));
    expect(reads()).toBe(3);
  });

  it('a place at the very end is sent without reading: it keeps a finish a finish', async () => {
    const a = await playing();
    now += 10_000;
    engine.seek(995);
    a.fire('loadedmetadata');
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(handoffServer.serverPlace).not.toHaveBeenCalled();
  });

  it('a read that fails lets the sync go: no way to tell, as it always was', async () => {
    const a = await playing();
    vi.mocked(handoffServer.serverPlace).mockRejectedValue(new TypeError('offline'));
    now += 10_000;
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
  });

  it('a page that is hiding sends at once, without reading first (the one write that cannot wait)', async () => {
    const a = await playing();
    listen(a, 5000);
    phoneFinishes();
    now += 10_000;
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.waitFor(() => expect(sent).toHaveLength(1));
    } finally {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    }
    expect(handoffServer.serverPlace).not.toHaveBeenCalled();
  });
});

describe('another device moving the book on is still the player-wins case', () => {
  it('a place, not a finish: no hold, this one carries on and goes on sending', async () => {
    const a = await playing();
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    now += 1000;
    server = { currentTime: 900, lastUpdate: now, isFinished: false };
    now += 1000;
    await engine.checkHandoff('tick');
    expect(finishedHeld()).toBeNull();
    expect(notices).toEqual([expect.objectContaining({ kind: 'conflict' })]);
    listen(a, 11_000);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
  });
});
