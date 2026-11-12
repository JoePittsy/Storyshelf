// @vitest-environment jsdom
// A sleep timer survives a reload of the same book on the same device (see sleepKept.ts): the restored, paused book
// shows it with the time it had left, and Play carries it on. A reload is a fresh engine over the same localStorage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Two files, and chapters: One is 0..300, Two is 300..1000 (it spans both files).
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

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  openSession: vi.fn((id: string) => Promise.resolve({ ...session, libraryItemId: id })),
  closeSession: vi.fn(() => Promise.resolve()),
  syncSession: vi.fn((s: unknown) => Promise.resolve(s)),
  saveProgress: vi.fn(() => Promise.resolve()),
  trackUrl: (_s: unknown, i: number) => `/t/${i}`,
}));
vi.mock('./handoffServer', () => ({ serverPlace: vi.fn(() => Promise.resolve(null)), recentSessions: vi.fn() }));

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
  volume = 1;
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

// The book is put back paused at 100 (in chapter One); the server's place, where Play really starts, is 450 (Two).
const book = { id: 'li_1', title: 'The Book', author: 'An Author', duration: 1000, position: 100, updatedAt: 0 };

let engine: typeof import('./engine');
let kept: typeof import('./sleepKept');
let now = 1_000_000_000_000;
let perf = 0;

/** A fresh engine over the same storage: the page was reloaded. */
async function reload() {
  vi.resetModules();
  FakeAudio.last = null;
  kept = await import('./sleepKept');
  engine = await import('./engine');
}

beforeEach(async () => {
  localStorage.clear();
  FakeAudio.last = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
  await reload();
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
/** Lets `ms` of playing time pass, in the small steps `timeupdate` really comes in. */
function run(a: FakeAudio, ms: number) {
  for (let left = ms; left > 0; left -= 5000) {
    const step = Math.min(5000, left);
    perf += step;
    now += step;
    a.fire('timeupdate');
  }
}
/** Presses Play on the restored book and lets it reach `playing` at 450. */
async function pressPlay() {
  engine.toggle();
  await vi.waitFor(() => expect(audio().src).toMatch(/^\/t\//)); // the session has opened and the book's file is loading
  const a = audio();
  a.paused = false;
  a.fire('playing');
  a.currentTime = 50;
  return a;
}
/** The restored book is playing with a timer, listens for `ms`, and pauses. */
async function listenedWithTimer(timer: Parameters<typeof engine.setSleep>[0], ms = 60_000) {
  engine.restore(book, session.chapters);
  engine.setSleep(timer);
  const a = await pressPlay();
  run(a, ms);
  a.pause();
  await vi.waitFor(() => expect(snapshot().status).toBe('paused'));
  return a;
}

describe('a reload with a sleep timer running', () => {
  it('brings the book back paused with the timer and the time it had left', async () => {
    await listenedWithTimer({ minutes: 15 });
    expect(snapshot().sleep).toMatchObject({ kind: 'minutes', remainingMs: 840_000 });
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot()).toMatchObject({
      restored: true,
      status: 'paused',
      sleep: { kind: 'minutes', remainingMs: 840_000, minutes: 15 },
      sleepFrom: 450, // the place this device kept when it paused: later than the snapshot's 100
    });
  });

  it('pressing Play carries it on from there, counting down only while playing', async () => {
    await listenedWithTimer({ minutes: 15 });
    await reload();
    engine.restore(book, session.chapters);
    now += 30 * 60_000; // the page sat paused for half an hour: nothing counted
    expect(snapshot().sleep).toMatchObject({ remainingMs: 840_000 });
    const a = await pressPlay();
    expect(snapshot()).toMatchObject({ sleep: { kind: 'minutes', remainingMs: 840_000 }, sleepFrom: 435 }); // 30 s back, after the pause
    run(a, 60_000);
    expect(snapshot().sleep).toMatchObject({ remainingMs: 780_000 });
  });

  it('keeps the time left as the book plays, not only when it was set', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 15 });
    const a = await pressPlay();
    run(a, 25_000); // two syncs have gone, the last at 20 s
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toMatchObject({ kind: 'minutes', remainingMs: 880_000 });
  });

  it('a timer set on a restored book that was never played comes back too', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 30 });
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toMatchObject({ kind: 'minutes', remainingMs: 1_800_000, minutes: 30 });
  });

  it('extending it is kept', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 15 });
    engine.setSleep({ addMinutes: 15 });
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toEqual({ kind: 'minutes', remainingMs: 1_800_000 });
  });

  it('an end-of-chapter timer comes back, and is worked out again for where Play really starts', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep('chapter');
    expect(snapshot().sleep).toEqual({ kind: 'chapter', endsAt: 300 }); // set in chapter One
    await reload();
    engine.restore({ ...book, position: 350 }, session.chapters); // the snapshot is a little later, in chapter Two
    expect(snapshot()).toMatchObject({ sleep: { kind: 'chapter', endsAt: 1000 }, sleepFrom: 350 });
    const a = await pressPlay(); // the server's place is 450, also chapter Two
    expect(snapshot().sleep).toEqual({ kind: 'chapter', endsAt: 1000 });
    a.currentTime = 599.6; // book 999.6: within half a second of the end of Two
    a.fire('timeupdate');
    expect(snapshot()).toMatchObject({ status: 'paused', sleep: null });
  });
});

describe('a timer that must not come back', () => {
  it('one that ran out', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 1 });
    const a = await pressPlay();
    run(a, 61_000);
    expect(snapshot()).toMatchObject({ status: 'paused', sleep: null });
    expect(localStorage.getItem(kept.SLEEP_KEPT_KEY)).toBeNull();
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });

  it('one that was turned off', async () => {
    await listenedWithTimer({ minutes: 15 });
    engine.setSleep('off');
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });

  it('one kept more than a few hours ago', async () => {
    await listenedWithTimer({ minutes: 15 });
    now += kept.SLEEP_KEPT_MAX_AGE_MS - 1000;
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toMatchObject({ kind: 'minutes' }); // still within the limit
    await reload();
    now += 2000;
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });

  it('one set for a different book: the restored book does not inherit it, and it is forgotten', async () => {
    await listenedWithTimer({ minutes: 15 });
    await reload();
    engine.restore({ ...book, id: 'li_2' }, session.chapters);
    expect(snapshot()).toMatchObject({ item: { id: 'li_2' }, sleep: null });
    expect(localStorage.getItem(kept.SLEEP_KEPT_KEY)).toBeNull();
    await reload();
    engine.restore(book, session.chapters); // and it does not wait for its own book to come back either
    expect(snapshot().sleep).toBeNull();
  });

  it('one on a book the listener has started another over', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 15 });
    void engine.play('li_2');
    await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_2'));
    expect(snapshot().sleep).toBeNull();
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });

  it('one on a book the player was stopped on (signing out stops it first)', async () => {
    await listenedWithTimer({ minutes: 15 });
    await engine.stop();
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });

  it('one that signing out forgot, even with no book in the player', async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 15 });
    await reload();
    kept.forgetKeptSleep(); // what the sign-out does, whatever the player holds
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });

  it("another user's, on the same device", async () => {
    engine.restore(book, session.chapters);
    engine.setSleep({ minutes: 15 });
    localStorage.setItem('storyshelf.lastUser', JSON.stringify({ id: 'u2', username: 'other', server: 'same-origin' }));
    await reload();
    engine.restore(book, session.chapters);
    expect(snapshot().sleep).toBeNull();
  });
});
