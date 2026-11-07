// @vitest-environment jsdom
// Taking a book out of the player before its progress is edited (marked finished or not, or reset): the player's own
// writes (a sync in flight, the close, a restored book's move) must all land before the edit, and none after it.
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

/** Every call the server would see, in order. */
let log: string[] = [];

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  openSession: vi.fn(() => Promise.resolve(session)),
  closeSession: vi.fn((s: { id: string }, p?: { currentTime: number }) => {
    log.push(`close ${s.id}${p ? ` at ${Math.round(p.currentTime)}` : ''}`);
    return Promise.resolve();
  }),
  syncSession: vi.fn(),
  saveProgress: vi.fn((id: string, t: number) => {
    log.push(`save ${id} at ${t}`);
    return Promise.resolve();
  }),
  trackUrl: () => '/t/1',
}));

/** An <audio> stand-in whose events the test fires. */
class FakeAudio {
  static last: FakeAudio;
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

const chapters = [
  { id: 0, start: 0, end: 300, title: 'One' },
  { id: 1, start: 300, end: 1000, title: 'Two' },
];
const book = { id: 'li_1', title: 'The Book', author: 'An Author', duration: 1000, position: 450, updatedAt: 1000 };

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');

beforeEach(async () => {
  vi.resetModules();
  log = [];
  vi.stubGlobal('Audio', FakeAudio);
  sessionApi = await import('./session');
  engine = await import('./engine');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const snapshot = () => renderHook(() => engine.usePlayer()).result.current;

/** Plays li_1 and lets it reach `playing` at `at` seconds. */
async function playing(at: number) {
  void engine.play('li_1');
  await vi.waitFor(() => expect(sessionApi.openSession).toHaveBeenCalled());
  await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
  const a = FakeAudio.last;
  a.paused = false;
  a.fire('playing');
  a.currentTime = at;
  return a;
}

describe('release', () => {
  it('does nothing, and says so, when the player has another book or none', async () => {
    expect(await engine.release('li_1')).toBeNull();
    engine.restore({ ...book, id: 'li_2' }, chapters);
    expect(await engine.release('li_1')).toBeNull();
    expect(snapshot().item?.id).toBe('li_2');
  });

  it('stops a playing book: the session closes with its last place, and the player is empty after', async () => {
    await playing(250);
    const held = await engine.release('li_1');
    expect(log).toEqual(['close s1 at 250']);
    expect(snapshot()).toMatchObject({ status: 'idle', item: null, restored: false });
    expect(held).toMatchObject({ restorable: { id: 'li_1', title: 'The Book', position: 250, duration: 1000 } });
  });

  it('waits for a sync already in flight before closing, so the close is the last thing the server hears', async () => {
    let finishSync!: () => void;
    vi.mocked(sessionApi.syncSession).mockImplementation((s, p) => {
      log.push(`sync ${s.id} at ${Math.round(p.currentTime)} (sent)`);
      return new Promise((resolve) => {
        finishSync = () => {
          log.push('sync answered');
          resolve(s);
        };
      });
    });
    const a = await playing(200);
    a.pause(); // the pause sync goes out and hangs
    await vi.waitFor(() => expect(log).toContain('sync s1 at 200 (sent)'));
    const done = engine.release('li_1');
    await new Promise((r) => setTimeout(r, 10));
    expect(log.some((l) => l.startsWith('close'))).toBe(false); // not while the sync is out
    finishSync();
    await done;
    // The pause sync carried the place. The close sends none: paused and unchecked since, the place might be older than
    // one another device has written (see engine.handoff.test.ts).
    expect(log).toEqual(['sync s1 at 200 (sent)', 'sync answered', 'close s1']);
  });

  it('closes a session the in-flight sync had to re-open (server restart) instead of leaving it open', async () => {
    let finishSync!: () => void;
    vi.mocked(sessionApi.syncSession).mockImplementation(
      () => new Promise((resolve) => (finishSync = () => resolve({ ...session, id: 's2' })))
    );
    const a = await playing(200);
    a.pause();
    await vi.waitFor(() => expect(sessionApi.syncSession).toHaveBeenCalled());
    const done = engine.release('li_1');
    finishSync();
    await done;
    expect(log).toEqual(expect.arrayContaining(['close s2', 'close s1']));
  });

  it('a restored book: an unsaved move reaches the server, then the player is empty', async () => {
    engine.restore(book, chapters);
    engine.seek(320); // saved after a short pause, which hasn't passed
    const held = await engine.release('li_1');
    expect(log).toEqual(['save li_1 at 320']);
    expect(held).toMatchObject({ restorable: { position: 320 }, chapters });
    expect(snapshot()).toMatchObject({ status: 'idle', item: null, restored: false });
    await new Promise((r) => setTimeout(r, 700)); // the move's own timer is gone: nothing more is sent
    expect(log).toEqual(['save li_1 at 320']);
    expect(sessionApi.openSession).not.toHaveBeenCalled();
  });

  it('a restored book with no move sends nothing', async () => {
    engine.restore(book, chapters);
    await engine.release('li_1');
    expect(log).toEqual([]);
    expect(snapshot().item).toBeNull();
  });

  it('a book still opening is abandoned: its session closes without a place', async () => {
    let open!: () => void;
    vi.mocked(sessionApi.openSession).mockImplementation(
      () => new Promise((resolve) => (open = () => resolve(session)))
    );
    void engine.play('li_1');
    expect(snapshot().status).toBe('loading');
    const held = await engine.release('li_1');
    expect(held).toBeNull(); // nothing was showing yet
    open();
    await vi.waitFor(() => expect(log).toEqual(['close s1']));
    expect(snapshot()).toMatchObject({ status: 'idle', item: null });
  });

  it('after a release, Play starts from the server (here, a reset: 0), not the old place', async () => {
    engine.restore(book, chapters);
    engine.seek(320);
    await engine.release('li_1');
    vi.mocked(sessionApi.openSession).mockResolvedValue({ ...session, currentTime: 0 });
    void engine.play('li_1');
    await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
    expect(snapshot().position).toBe(0);
  });
});
