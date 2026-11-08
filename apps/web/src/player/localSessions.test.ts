// @vitest-environment jsdom
/**
 * Listening done offline, queued on the device and sent to ABS as local sessions (POST /api/session/local-all).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/auth', async (orig) => ({
  ...(await orig<typeof import('../api/auth')>()),
  absFetch: vi.fn(),
  hasAccessToken: () => true,
}));
vi.mock('./session', () => ({ ourDeviceId: () => 'dev-here' }));

let q: typeof import('./localSessions');
let auth: typeof import('../api/auth');
let connectivity: typeof import('../api/connectivity');

/** Local time: 8 November 2026 at the given hour and minute. */
const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m).getTime();

const listened = (currentTime: number, timeListened: number) => ({
  itemId: 'li_1',
  title: 'The Book',
  author: 'An Author',
  duration: 1000,
  startTime: 400,
  currentTime,
  timeListened,
});

interface Body {
  deviceInfo: { deviceId: string; clientName: string };
  sessions: import('./localSessions').LocalSession[];
}
const bodies = (): Body[] =>
  vi.mocked(auth.absFetch).mock.calls.map(([path, init]) => {
    expect(path).toBe('/api/session/local-all');
    return JSON.parse(String(init?.body)) as Body;
  });

/** ABS taking every session it is sent. */
const acceptAll = (progressSynced = true) =>
  vi.mocked(auth.absFetch).mockImplementation((_path, init) => {
    const { sessions } = JSON.parse(String(init?.body)) as Body;
    return Promise.resolve({ results: sessions.map((s) => ({ id: s.id, success: true, progressSynced })) });
  });

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  auth = await import('../api/auth');
  connectivity = await import('../api/connectivity');
  q = await import('./localSessions');
});
afterEach(() => {
  connectivity.resetConnectivityForTests();
  vi.clearAllMocks();
});

describe('recording listening', () => {
  it('adds to the book’s open session through the day', () => {
    q.recordListening(listened(410, 10), at(9));
    q.recordListening(listened(420, 10), at(9, 1));
    const [s, ...rest] = q.queuedSessions();
    expect(rest).toEqual([]);
    expect(s).toMatchObject({
      libraryItemId: 'li_1',
      mediaType: 'book',
      playMethod: 3,
      mediaPlayer: 'html5',
      startTime: 400,
      currentTime: 420,
      timeListening: 20,
      startedAt: at(9) - 10_000, // when the first listening began
      updatedAt: at(9, 1),
      duration: 1000,
    });
  });

  it('splits at local midnight: the new day’s session starts where the last left off', () => {
    q.recordListening(listened(410, 10), at(23, 59));
    q.recordListening(listened(430, 20), at(24));
    const [a, b] = q.queuedSessions();
    expect(a).toMatchObject({ startTime: 400, currentTime: 410, timeListening: 10, updatedAt: at(23, 59) });
    // It began at midnight at the earliest: its 20 s that crossed midnight count for the new day.
    expect(b).toMatchObject({ startTime: 410, currentTime: 430, timeListening: 20, startedAt: at(24) });
    expect(b.id).not.toBe(a.id);
  });

  it('a stopped book’s next listening starts a new session', () => {
    q.recordListening(listened(410, 10), at(9));
    q.endListening('li_1');
    q.recordListening(listened(500, 5), at(10));
    const [a, b] = q.queuedSessions();
    expect(b.id).not.toBe(a.id);
    expect(b.startTime).toBe(400);
  });
});

describe('sending it', () => {
  it('sends unsent sessions with this device, and drops a finished one once taken', async () => {
    acceptAll();
    q.recordListening(listened(410, 10), at(9));
    q.endListening('li_1');
    const results = await q.flushListening();
    expect(bodies()[0]).toMatchObject({
      deviceInfo: { deviceId: 'dev-here', clientName: 'Storyshelf' },
      sessions: [{ libraryItemId: 'li_1', currentTime: 410, timeListening: 10 }],
    });
    expect(results).toMatchObject([{ success: true, progressSynced: true, currentTime: 410 }]);
    expect(q.queuedSessions()).toEqual([]);
    expect(q.hasUnsent()).toBe(false);
  });

  it('keeps an open session, sent, so more listening updates the same row', async () => {
    acceptAll();
    q.recordListening(listened(410, 10), at(9));
    await q.flushListening();
    expect(q.hasUnsent('li_1')).toBe(false);
    q.recordListening(listened(420, 10), at(9, 1));
    expect(q.hasUnsent('li_1')).toBe(true);
    await q.flushListening();
    const [first, second] = bodies();
    expect(second.sessions[0].id).toBe(first.sessions[0].id);
    expect(second.sessions[0]).toMatchObject({ currentTime: 420, timeListening: 20 });
  });

  it('a failed send keeps everything, and the retry sends the same session again', async () => {
    q.recordListening(listened(410, 10), at(9));
    vi.mocked(auth.absFetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await q.flushListening()).toEqual([]);
    expect(q.hasUnsent('li_1')).toBe(true);
    acceptAll();
    await q.flushListening();
    const [first, second] = bodies();
    expect(second.sessions[0].id).toBe(first.sessions[0].id);
    expect(q.hasUnsent()).toBe(false);
  });

  it('a session the server refuses for good (the book is gone) is dropped; one it didn’t answer stays', async () => {
    q.recordListening(listened(410, 10), at(9));
    q.recordListening({ ...listened(50, 5), itemId: 'li_2' }, at(9));
    const [one] = q.queuedSessions();
    vi.mocked(auth.absFetch).mockResolvedValueOnce({
      results: [{ id: one.id, success: false, error: 'Media item not found' }],
    });
    await q.flushListening();
    expect(q.queuedSessions().map((s) => s.libraryItemId)).toEqual(['li_2']);
  });

  it('sends nothing offline', async () => {
    connectivity.markUnreachable();
    q.recordListening(listened(410, 10), at(9));
    await q.flushListening();
    expect(auth.absFetch).not.toHaveBeenCalled();
  });

  it('sends what was queued when the app comes back online', async () => {
    acceptAll();
    connectivity.markUnreachable();
    const stop = q.startListeningSync();
    q.recordListening(listened(410, 10), at(9));
    expect(auth.absFetch).not.toHaveBeenCalled();
    connectivity.markReachable();
    await vi.waitFor(() => expect(bodies()).toHaveLength(1));
    stop();
  });

  it('at launch, a session an earlier visit left open is closed and sent', async () => {
    acceptAll();
    q.recordListening(listened(410, 10), at(9));
    const stop = q.startListeningSync();
    await vi.waitFor(() => expect(q.queuedSessions()).toEqual([]));
    stop();
  });

  it('tells listeners what the server said', async () => {
    acceptAll(false);
    const heard = vi.fn();
    q.onListeningSynced(heard);
    q.recordListening(listened(410, 10), at(9));
    await q.flushListening();
    expect(heard).toHaveBeenCalledWith([
      expect.objectContaining({ libraryItemId: 'li_1', success: true, progressSynced: false, currentTime: 410 }),
    ]);
  });
});
