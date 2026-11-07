// @vitest-environment jsdom
// Player comfort: each book keeps its speed, playback rewinds a little after a pause, and the sleep timer fades out
// and offers back the place it began.
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

/** Every place the server is sent, in order. */
let sent: number[] = [];

vi.mock('./session', async (orig) => ({
  ...(await orig<typeof import('./session')>()),
  openSession: vi.fn((id: string) => Promise.resolve({ ...session, libraryItemId: id })),
  closeSession: vi.fn(() => Promise.resolve()),
  syncSession: vi.fn((s: unknown, p: { currentTime: number }) => {
    sent.push(Math.round(p.currentTime));
    return Promise.resolve(s);
  }),
  saveProgress: vi.fn(() => Promise.resolve()),
  trackUrl: (_s: unknown, i: number) => `/t/${i}`,
}));

/** An <audio> stand-in whose events the test fires. Its volume can be set, as on a desktop browser. */
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

let engine: typeof import('./engine');
let sessionApi: typeof import('./session');
let speeds: typeof import('./bookSpeeds');
let asleep: typeof import('./fellAsleep');
let jumpLog: typeof import('./jumpLog');

let now = 1_000_000_000_000;
let perf = 0;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  sent = [];
  FakeAudio.last = null;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => perf);
  sessionApi = await import('./session');
  speeds = await import('./bookSpeeds');
  asleep = await import('./fellAsleep');
  jumpLog = await import('./jumpLog');
  engine = await import('./engine');
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
    perf += Math.min(5000, left);
    a.fire('timeupdate');
  }
}
const marks = (id = 'li_1') => renderHook(() => jumpLog.useJumpMarks(id)).result.current;

/** Plays a book from the server's place (450, in file 2 at 50) and lets it reach `playing`. */
async function playing(id = 'li_1') {
  void engine.play(id);
  await vi.waitFor(() => expect(snapshot().item?.id).toBe(id));
  const a = audio();
  a.paused = false;
  a.fire('playing');
  a.currentTime = 50;
  return a;
}

/** Listens a second (so the pause has something to sync), pauses, then lets `ms` of real time pass. */
async function pauseFor(a: FakeAudio, ms: number) {
  perf += 1000;
  a.pause();
  await vi.waitFor(() => expect(snapshot().status).toBe('paused'));
  now += ms;
}

describe('each book keeps its speed', () => {
  it('a speed set while a book is loaded stays with that book; other books play at the default', async () => {
    const a = await playing('li_1');
    engine.setRate(1.5);
    expect(a.playbackRate).toBe(1.5);
    expect(speeds.bookSpeed('li_1')).toBe(1.5);

    await playing('li_2');
    expect(snapshot().rate).toBe(1);
    expect(audio().playbackRate).toBe(1);

    await playing('li_1');
    expect(snapshot().rate).toBe(1.5);
    expect(audio().playbackRate).toBe(1.5);
  });

  it('setting a book back to the default speed forgets it, so it follows later changes to the default', async () => {
    await playing('li_1');
    engine.setRate(1.5);
    engine.setRate(1);
    expect(speeds.bookSpeed('li_1')).toBeUndefined();
    engine.setDefaultRate(1.2);
    expect(snapshot().rate).toBe(1.2);
  });

  it('the default comes from Settings, and survives a reload', async () => {
    engine.setDefaultRate(1.3);
    vi.resetModules();
    const again = await import('./engine');
    expect(renderHook(() => again.usePlayer()).result.current).toMatchObject({ rate: 1.3, defaultRate: 1.3 });
  });

  it('changing the default leaves a book with its own speed alone', async () => {
    await playing('li_1');
    engine.setRate(1.5);
    engine.setDefaultRate(1.2);
    expect(snapshot()).toMatchObject({ rate: 1.5, defaultRate: 1.2 });
    expect(audio().playbackRate).toBe(1.5);
  });

  it('a restored book shows its own speed before it plays', () => {
    speeds.rememberBookSpeed('li_1', 1.7, 1);
    engine.restore({ id: 'li_1', title: 'T', author: 'A', duration: 1000, position: 450, updatedAt: 0 }, []);
    expect(snapshot().rate).toBe(1.7);
  });

  it('resetting all book speeds puts the loaded book back on the default', async () => {
    await playing('li_1');
    engine.setRate(1.5);
    engine.resetBookSpeeds();
    expect(snapshot().rate).toBe(1);
    expect(audio().playbackRate).toBe(1);
    expect(speeds.bookSpeed('li_1')).toBeUndefined();
  });

  it('after stop, the player shows the default speed', async () => {
    await playing('li_1');
    engine.setRate(1.5);
    await engine.stop();
    expect(snapshot().rate).toBe(1);
  });
});

describe('rewinding after a pause', () => {
  it('after a pause of a couple of minutes, playback resumes 5 seconds back', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60_000);
    engine.toggle();
    expect(a.currentTime).toBe(45); // file 2 starts at 400: book 445
    expect(snapshot().position).toBe(445);
  });

  it('a quick pause resumes exactly where it stopped', async () => {
    const a = await playing();
    await pauseFor(a, 3000);
    engine.toggle();
    expect(a.currentTime).toBe(50);
  });

  it('is not a jump: nothing goes in the history or the undo log', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60 * 60_000);
    engine.toggle();
    expect(a.currentTime).toBe(20);
    expect(marks()).toEqual([]);
  });

  it('is in place before the first sync after resuming', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60 * 60_000);
    await vi.waitFor(() => expect(sent).toEqual([450]));
    engine.toggle();
    a.fire('playing');
    perf += 12_000; // more than 10 s of listening: a sync is due
    a.currentTime = 20 + 12;
    a.fire('timeupdate');
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toBe(432);
  });

  it('never goes back past the start of the chapter', async () => {
    vi.mocked(sessionApi.openSession).mockResolvedValueOnce({ ...session, currentTime: 310 });
    void engine.play('li_1');
    await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
    const a = audio();
    a.paused = false;
    a.fire('playing');
    a.currentTime = 310;
    await pauseFor(a, 2 * 60 * 60_000);
    engine.toggle();
    expect(a.currentTime).toBe(300);
  });

  it('crosses back into the previous file when it has to, and plays from there', async () => {
    const a = await playing();
    a.currentTime = 2; // book 402
    await pauseFor(a, 2 * 60 * 60_000);
    engine.toggle();
    expect(a.src).toBe('/t/1');
    expect(snapshot().position).toBe(372);
    expect(a.paused).toBe(false);
  });

  it('only once: a second toggle straight after does not rewind again', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60_000);
    engine.toggle();
    a.fire('playing');
    a.pause();
    engine.toggle();
    expect(a.currentTime).toBe(45);
  });

  it('not when the listener moved the place while paused: they chose where to start', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60 * 60_000);
    engine.seek(470);
    engine.toggle();
    expect(a.currentTime).toBe(70);
  });

  it('not when it is turned off in Settings', async () => {
    engine.setRewindOnResume(false);
    const a = await playing();
    await pauseFor(a, 2 * 60 * 60_000);
    engine.toggle();
    expect(a.currentTime).toBe(50);
    expect(snapshot().rewindOnResume).toBe(false);
  });

  it('play() on the paused book (the hero Resume) rewinds too; play() from a named place does not', async () => {
    const a = await playing();
    await pauseFor(a, 2 * 60_000);
    void engine.play('li_1');
    expect(a.currentTime).toBe(45);
    a.fire('playing');
    await pauseFor(a, 2 * 60_000);
    void engine.play('li_1', 600);
    expect(snapshot().position).toBe(600);
  });

  const book = { id: 'li_1', title: 'The Book', author: 'An Author', duration: 1000, position: 450 };

  it('a restored book: the first play rewinds by how long ago the server heard of the place', async () => {
    engine.restore({ ...book, updatedAt: now - 2 * 60 * 60_000 }, session.chapters);
    engine.toggle();
    await vi.waitFor(() => expect(snapshot().item?.id).toBe('li_1'));
    await vi.waitFor(() => expect(snapshot().position).toBe(420));
    expect(audio().src).toBe('/t/2');
    expect(marks()).toEqual([]);
  });

  it('a restored book whose save time is unknown starts exactly at the server’s place', async () => {
    engine.restore({ ...book, updatedAt: 0 }, session.chapters);
    engine.toggle();
    await vi.waitFor(() => expect(sessionApi.openSession).toHaveBeenCalled());
    await vi.waitFor(() => expect(snapshot().position).toBe(450));
  });

  it('a restored book that another device has moved on since starts exactly at the server’s place', async () => {
    engine.restore({ ...book, position: 200, updatedAt: now - 2 * 60 * 60_000 }, session.chapters);
    engine.toggle();
    await vi.waitFor(() => expect(sessionApi.openSession).toHaveBeenCalled());
    await vi.waitFor(() => expect(snapshot().position).toBe(450));
  });

  it('a restored book moved here before playing starts where it was moved to', async () => {
    engine.restore({ ...book, updatedAt: now - 2 * 60 * 60_000 }, session.chapters);
    engine.seek(600);
    engine.toggle();
    await vi.waitFor(() => expect(sessionApi.openSession).toHaveBeenCalled());
    await vi.waitFor(() => expect(snapshot().position).toBe(600));
  });
});

describe('the sleep timer fades out', () => {
  it('ramps the volume down over the last seconds, then pauses and puts the volume back', async () => {
    const a = await playing();
    a.volume = 0.8;
    engine.setSleep({ minutes: 1 });
    run(a, 50_000); // 10 s left: the fade is about to start
    expect(a.volume).toBe(0.8);
    run(a, 5_000); // 5 s left
    expect(a.volume).toBeCloseTo(0.2);
    run(a, 5_000);
    expect(a.paused).toBe(true);
    expect(a.volume).toBe(0.8);
    expect(snapshot()).toMatchObject({ status: 'paused', sleep: null });
  });

  it('end of chapter fades too, measured in real time at the current speed', async () => {
    const a = await playing();
    engine.setRate(2);
    engine.setSleep('chapter'); // chapter Two ends at 1000; the timer stops at 999.5
    a.currentTime = 589.5; // book 989.5: 10 book seconds, 5 real seconds, left
    a.fire('timeupdate');
    expect(a.volume).toBeCloseTo(0.25);
    a.currentTime = 599.6;
    a.fire('timeupdate');
    expect(a.paused).toBe(true);
    expect(a.volume).toBe(1);
  });

  it('turning the timer off mid-fade puts the volume straight back', async () => {
    const a = await playing();
    engine.setSleep({ minutes: 1 });
    run(a, 55_000);
    expect(a.volume).toBeLessThan(1);
    engine.setSleep('off');
    expect(a.volume).toBe(1);
  });

  it('pausing mid-fade puts the volume back', async () => {
    const a = await playing();
    engine.setSleep({ minutes: 1 });
    run(a, 55_000);
    a.pause();
    expect(a.volume).toBe(1);
  });

  it('stopping mid-fade puts the volume back', async () => {
    const a = await playing();
    engine.setSleep({ minutes: 1 });
    run(a, 55_000);
    await engine.stop();
    expect(a.volume).toBe(1);
  });

  it('where volume is read-only (iOS), nothing breaks: it simply stops at full volume', async () => {
    const a = await playing();
    Object.defineProperty(a, 'volume', { get: () => 1, set: () => undefined, configurable: true });
    engine.setSleep({ minutes: 1 });
    run(a, 60_000);
    expect(a.paused).toBe(true);
    expect(snapshot().status).toBe('paused');
  });
});

describe('you fell asleep here', () => {
  it('when the timer pauses playback, the place it began is offered back, until playback starts again', async () => {
    const a = await playing(); // book 450
    engine.setSleep({ minutes: 1 });
    a.currentTime = 110; // book 510
    run(a, 60_000);
    const s = snapshot();
    expect(s).toMatchObject({ status: 'paused', position: 510 });
    const offer = () => renderHook(() => asleep.useFellAsleep('li_1', s.position, s.status)).result.current;
    expect(offer()).toMatchObject({ itemId: 'li_1', target: 450, chapter: null });
    engine.toggle();
    a.fire('playing');
    expect(renderHook(() => asleep.useFellAsleep('li_1', 510, 'paused')).result.current).toBeNull();
  });

  it('a seek forgets it', async () => {
    const a = await playing();
    engine.setSleep({ minutes: 1 });
    a.currentTime = 110;
    run(a, 60_000);
    engine.seek(505);
    expect(renderHook(() => asleep.useFellAsleep('li_1', 510, 'paused')).result.current).toBeNull();
  });

  it('a pause by hand is not falling asleep', async () => {
    const a = await playing();
    engine.setSleep({ minutes: 30 });
    a.currentTime = 110;
    a.pause();
    expect(renderHook(() => asleep.useFellAsleep('li_1', 510, 'paused')).result.current).toBeNull();
  });
});
