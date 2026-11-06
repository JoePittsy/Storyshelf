/**
 * Tests for the ABS playback-session client (open, sync, close, track URLs).
 * Code under test: apps/web/src/player/session.ts (and, through it, absFetch in
 * apps/web/src/api/auth.ts, which must tolerate responses that are not JSON).
 *
 * Requirements covered (IDs appear in the test names):
 *  REQ-14 Play/Resume starts from the position saved on the server.
 *  REQ-22 Progress is saved while playing, on pause, and when the app is hidden or closed.
 *  REQ-23 Another device resumes from the latest position (REQ-14 plus REQ-22).
 *  REQ-24 If the server restarts mid-listen, syncing recovers without user action.
 *
 * Design facts (ABS v2.37.2, checked against server/managers/PlaybackSessionManager.js,
 * server/controllers/SessionController.js and LibraryItemController):
 *  - POST /api/items/:id/play body: {deviceInfo:{deviceId, clientName}, supportedMimeTypes,
 *    mediaPlayer:'html5', forceDirectPlay:false}. `currentTime` in the reply is the saved progress.
 *  - POST /api/session/:id/sync replies 200 via Express `sendStatus(200)`, so the body is the
 *    plain text "OK" (or empty), NEVER JSON. Sessions live in server memory: after a restart
 *    the sync answers 404. The same holds for /close.
 *  - /api/* needs `Authorization: Bearer <access token>`; /public/session/* does not.
 *
 * `fetch` is stubbed with a small stateful fake ABS server (as auth.test.ts does), not `absFetch`.
 * Modules are re-imported for every test so the module-level state (the in-memory device id,
 * the access token) never leaks between tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter } from './chapters';
import type { PlaybackSession } from './session';
import { dueOnStop, payload, startClock, tick } from './sync';
import type { AudioTrack } from './timeline';

// ---------------------------------------------------------------------------
// Fake ABS server
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  method: string;
  init: RequestInit;
  /** Parsed JSON request body, or undefined when there was none. */
  body: unknown;
  /** Value of the Authorization header, or null if absent. */
  auth: string | null;
}

type Route = (call: Call) => Response | Promise<Response> | undefined;

const MIME = ['audio/mpeg', 'audio/mp4'];
const ACCESS = 'access-1';
const ITEM = 'li_1';
const SYNC_BODY = { currentTime: 112, timeListened: 12, duration: 3600 };

const TRACKS: AudioTrack[] = [
  { index: 1, startOffset: 0, duration: 1800, contentUrl: `/api/items/${ITEM}/file/ino1`, mimeType: 'audio/mpeg' },
  { index: 2, startOffset: 1800, duration: 1800, contentUrl: `/api/items/${ITEM}/file/ino2`, mimeType: 'audio/mpeg' },
];
const CHAPTERS: Chapter[] = [
  { id: 0, start: 0, end: 1800, title: 'One' },
  { id: 1, start: 1800, end: 3600, title: 'Two' },
];

const jsonRes = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function parseBody(init: RequestInit): unknown {
  return typeof init.body === 'string' && init.body !== '' ? (JSON.parse(init.body) as unknown) : undefined;
}

function fakeAbs(opts: { route?: Route; syncReply?: string; playMethod?: number } = {}) {
  const calls: Call[] = [];
  const sessions = new Map<string, string>(); // open session id -> library item id
  const progress = new Map<string, { currentTime: number; timeListened: number }>(); // by library item id
  let next = 1;

  const open = (itemId: string): string => {
    const id = `sess-${next++}`;
    sessions.set(id, itemId);
    return id;
  };

  vi.stubGlobal('fetch', (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    const call: Call = { url, method, init, body: parseBody(init), auth: new Headers(init.headers).get('authorization') };
    calls.push(call);

    return Promise.resolve().then(async (): Promise<Response> => {
      const forced = opts.route?.(call);
      if (forced) return forced;

      if (url.startsWith('/api/') && call.auth !== `Bearer ${ACCESS}`) return new Response('Unauthorized', { status: 401 });

      const play = /^\/api\/items\/([^/]+)\/play$/.exec(url);
      if (method === 'POST' && play) {
        const itemId = play[1] ?? '';
        const id = open(itemId);
        return jsonRes({
          id,
          userId: 'u1',
          libraryId: 'lib1',
          libraryItemId: itemId,
          mediaType: 'book',
          chapters: CHAPTERS,
          displayTitle: 'The Long Walk',
          displayAuthor: 'A. Writer',
          duration: 3600,
          playMethod: opts.playMethod ?? 0,
          mediaPlayer: 'html5',
          currentTime: progress.get(itemId)?.currentTime ?? 0,
          audioTracks: TRACKS,
        });
      }

      const sess = /^\/api\/session\/([^/]+)\/(sync|close)$/.exec(url);
      if (method === 'POST' && sess) {
        const itemId = sessions.get(sess[1] ?? '');
        if (itemId === undefined) return new Response('Not Found', { status: 404 });
        const b = call.body as { currentTime?: number; timeListened?: number } | undefined;
        if (b?.currentTime !== undefined) {
          progress.set(itemId, { currentTime: b.currentTime, timeListened: b.timeListened ?? 0 });
        }
        if (sess[2] === 'close') sessions.delete(sess[1] ?? '');
        return new Response(opts.syncReply ?? 'OK', { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });
  });

  return {
    calls,
    sessions,
    progress,
    open,
    /** Simulates an ABS restart: open sessions vanish, saved progress survives (it is in the database). */
    restart: () => sessions.clear(),
    /** Requests other than sign-in, as "METHOD url", in order. */
    log: () => calls.filter((c) => c.url !== '/login').map((c) => `${c.method} ${c.url}`),
    to: (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url),
  };
}

// ---------------------------------------------------------------------------
// Test plumbing
// ---------------------------------------------------------------------------

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((k: string) => m.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void m.set(k, v)),
    removeItem: vi.fn((k: string) => void m.delete(k)),
    clear: vi.fn(() => m.clear()),
    key: vi.fn(() => null),
    get length() {
      return m.size;
    },
  };
}

let uuid: ReturnType<typeof vi.fn<() => string>>;

beforeEach(() => {
  uuid = vi.fn(() => 'device-uuid-1');
  vi.stubGlobal('crypto', { randomUUID: uuid });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});

afterEach(async () => {
  const auth = await import('../api/auth');
  auth.resetAuthForTests();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/**
 * Fresh module graph for the test, already signed in so /api requests carry a bearer token.
 * Sign-in uses its own throwaway fetch stub; call fakeAbs() AFTER load() to install the fake server.
 */
async function load() {
  vi.resetModules();
  const session = await import('./session');
  const auth = await import('../api/auth');
  vi.stubGlobal('fetch', () =>
    Promise.resolve(jsonRes({ user: { id: 'u1', username: 'joe', accessToken: ACCESS, refreshToken: null, mediaProgress: [] } })),
  );
  await auth.login('joe', 'correct');
  return session;
}

/** A client-side session object matching a session the fake server has open. */
function liveSession(id: string, overrides: Partial<PlaybackSession> = {}): PlaybackSession {
  return {
    id,
    libraryItemId: ITEM,
    currentTime: 0,
    duration: 3600,
    playMethod: 0,
    audioTracks: TRACKS,
    chapters: CHAPTERS,
    displayTitle: 'The Long Walk',
    displayAuthor: 'A. Writer',
    ...overrides,
  };
}

const bodyOf = (c: Call | undefined): Record<string, unknown> => (c?.body ?? {}) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// openSession
// ---------------------------------------------------------------------------

describe('REQ-14: openSession starts from the saved position', () => {
  // Given the server holds 1:02:10 for the book, openSession returns a session whose currentTime is 3730.
  it('REQ-14: uses the currentTime the server returns as the saved position (1:02:10 = 3730 s)', async () => {
    const { openSession } = await load();
    const abs = fakeAbs();
    abs.progress.set(ITEM, { currentTime: 3730, timeListened: 0 });
    const s = await openSession(ITEM, MIME);
    expect(s.currentTime, 'Expected Resume to start from the saved 3730 s').toBe(3730);
  });

  it('REQ-14: a book with no saved progress starts at 0', async () => {
    const { openSession } = await load();
    fakeAbs();
    const s = await openSession(ITEM, MIME);
    expect(s.currentTime, 'Expected a never-played book to start at 0').toBe(0);
  });

  it('REQ-14: returns the session fields the player needs', async () => {
    const { openSession } = await load();
    fakeAbs();
    const s = await openSession(ITEM, MIME);
    expect(s, 'Expected id, item, duration, play method, tracks, chapters and display text from the play reply').toMatchObject({
      id: 'sess-1',
      libraryItemId: ITEM,
      duration: 3600,
      playMethod: 0,
      audioTracks: TRACKS,
      chapters: CHAPTERS,
      displayTitle: 'The Long Walk',
      displayAuthor: 'A. Writer',
    });
  });
});

describe('REQ-14: openSession request', () => {
  // POST /api/items/:id/play with the exact ABS body.
  it('REQ-14: POSTs the play request with the exact ABS body to /api/items/:id/play', async () => {
    const { openSession } = await load();
    const abs = fakeAbs();
    await openSession(ITEM, MIME);
    const plays = abs.to('POST', `/api/items/${ITEM}/play`);
    expect(plays, 'Expected exactly one POST /api/items/li_1/play').toHaveLength(1);
    const body = bodyOf(plays[0]);
    expect(Object.keys(body).sort(), 'Expected only the four fields ABS reads').toEqual([
      'deviceInfo',
      'forceDirectPlay',
      'mediaPlayer',
      'supportedMimeTypes',
    ]);
    expect(body.mediaPlayer, "Expected mediaPlayer 'html5'").toBe('html5');
    expect(body.forceDirectPlay, 'Expected forceDirectPlay false').toBe(false);
    expect(body.supportedMimeTypes, 'Expected the caller-supplied MIME types to be passed through').toEqual(MIME);
  });

  it('REQ-14: identifies the client as Storyshelf with the device id', async () => {
    const { openSession } = await load();
    const abs = fakeAbs();
    await openSession(ITEM, MIME);
    const info = bodyOf(abs.to('POST', `/api/items/${ITEM}/play`)[0]).deviceInfo as Record<string, unknown>;
    expect(info.clientName, "Expected clientName 'Storyshelf'").toBe('Storyshelf');
    expect(info.deviceId, 'Expected the generated device id in deviceInfo.deviceId').toBe('device-uuid-1');
    expect(
      Object.keys(info).every((k) => ['deviceId', 'clientName', 'clientVersion'].includes(k)),
      'Expected deviceInfo to hold only deviceId, clientName and the optional clientVersion',
    ).toBe(true);
  });

  it('REQ-14: sends JSON and the bearer token', async () => {
    const { openSession } = await load();
    const abs = fakeAbs();
    await openSession(ITEM, MIME);
    const play = abs.to('POST', `/api/items/${ITEM}/play`)[0];
    expect(new Headers(play?.init.headers).get('content-type'), 'Expected a JSON content type').toMatch(/application\/json/);
    expect(play?.auth, 'Expected the in-memory access token as a bearer token').toBe(`Bearer ${ACCESS}`);
  });

  it('REQ-14: rejects when the server refuses the play request', async () => {
    const { openSession, UnsupportedFormatError } = await load();
    fakeAbs({ route: (c) => (c.url.endsWith('/play') ? new Response('Not Found', { status: 404 }) : undefined) });
    const result = await openSession(ITEM, MIME).then(
      () => 'resolved',
      (e: unknown) => (e instanceof UnsupportedFormatError ? 'unsupported' : 'rejected'),
    );
    expect(result, 'Expected a plain rejection (not UnsupportedFormatError) for a 404 from /play').toBe('rejected');
  });
});

describe('REQ-14: openSession device id', () => {
  it('REQ-14: generates a device id once with crypto.randomUUID and persists it under storyshelf.deviceId', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const { openSession } = await load();
    fakeAbs();
    await openSession(ITEM, MIME);
    expect(uuid, 'Expected exactly one UUID to be generated').toHaveBeenCalledTimes(1);
    expect(storage.setItem, "Expected the id saved under 'storyshelf.deviceId'").toHaveBeenCalledWith('storyshelf.deviceId', 'device-uuid-1');
  });

  it('REQ-14: reuses a device id already stored, without generating a new one', async () => {
    vi.stubGlobal('localStorage', memoryStorage({ 'storyshelf.deviceId': 'stored-device' }));
    const { openSession } = await load();
    const abs = fakeAbs();
    await openSession(ITEM, MIME);
    const info = bodyOf(abs.to('POST', `/api/items/${ITEM}/play`)[0]).deviceInfo as Record<string, unknown>;
    expect(info.deviceId, 'Expected the stored device id to be sent').toBe('stored-device');
    expect(uuid, 'Expected no new UUID when one is stored').not.toHaveBeenCalled();
  });

  it('REQ-14: uses the same device id for every session opened in one page', async () => {
    const { openSession } = await load();
    const abs = fakeAbs();
    await openSession(ITEM, MIME);
    await openSession('li_2', MIME);
    const ids = abs.calls.filter((c) => c.url.endsWith('/play')).map((c) => (bodyOf(c).deviceInfo as { deviceId: string }).deviceId);
    expect(ids, 'Expected both play requests to carry the same device id').toEqual(['device-uuid-1', 'device-uuid-1']);
    expect(uuid, 'Expected the id to be generated only once').toHaveBeenCalledTimes(1);
  });

  it('REQ-14: still plays when storage reads and writes throw, and keeps one in-memory id', async () => {
    const boom = () => {
      throw new DOMException('Storage disabled', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 });
    const { openSession } = await load();
    const abs = fakeAbs();
    await openSession(ITEM, MIME);
    await openSession('li_2', MIME);
    const ids = abs.calls.filter((c) => c.url.endsWith('/play')).map((c) => (bodyOf(c).deviceInfo as { deviceId: string }).deviceId);
    expect(ids, 'Expected the session to open and the same in-memory id to be reused when storage throws').toEqual([
      'device-uuid-1',
      'device-uuid-1',
    ]);
  });

  it('REQ-14: still plays when merely touching localStorage throws (as in some private windows)', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
    const { openSession } = await load();
    const abs = fakeAbs();
    const s = await openSession(ITEM, MIME);
    expect(s.id, 'Expected a session to open although the storage accessor throws').toBe('sess-1');
    const info = bodyOf(abs.to('POST', `/api/items/${ITEM}/play`)[0]).deviceInfo as Record<string, unknown>;
    expect(typeof info.deviceId === 'string' && info.deviceId !== '', 'Expected a non-empty in-memory device id').toBe(true);
  });
});

describe('REQ-14: openSession only accepts direct play', () => {
  // ABS PlayMethod: 0 direct play, 1 direct stream, 2 transcode, 3 local. Anything but 0 is unsupported.
  it.each([1, 2, 3])('REQ-14: playMethod %i is rejected with UnsupportedFormatError', async (playMethod) => {
    const { openSession, UnsupportedFormatError } = await load();
    fakeAbs({ playMethod });
    await expect(
      openSession(ITEM, MIME),
      `Expected UnsupportedFormatError because ABS chose playMethod ${playMethod} instead of direct play (0)`,
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});

// ---------------------------------------------------------------------------
// syncSession
// ---------------------------------------------------------------------------

describe('REQ-22: syncSession sends progress', () => {
  it('REQ-22: POSTs the progress body to /api/session/:id/sync with the bearer token', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    await syncSession(s, SYNC_BODY, MIME);
    const syncs = abs.to('POST', `/api/session/${s.id}/sync`);
    expect(syncs, 'Expected exactly one sync request for the open session').toHaveLength(1);
    expect(syncs[0]?.body, 'Expected {currentTime, timeListened, duration} as the body').toEqual(SYNC_BODY);
    expect(syncs[0]?.auth, 'Expected the bearer token on the sync request').toBe(`Bearer ${ACCESS}`);
  });

  it('REQ-22: resolves with the same session and no re-open when the sync succeeds', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    const active = await syncSession(s, SYNC_BODY, MIME);
    expect(active, 'Expected the existing session to stay active after a good sync').toEqual(s);
    expect(abs.log(), 'Expected no play request after a successful sync').toEqual([`POST /api/session/${s.id}/sync`]);
  });

  // ABS answers 200 with the plain text "OK" (Express sendStatus), which is not JSON.
  it('REQ-22: resolves when ABS answers 200 with the text body "OK"', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs({ syncReply: 'OK' });
    const s = liveSession(abs.open(ITEM));
    await expect(syncSession(s, SYNC_BODY, MIME), 'Expected a non-JSON "OK" body not to be parsed as JSON').resolves.toEqual(s);
  });

  it('REQ-22: resolves when ABS answers 200 with an empty body', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs({ syncReply: '' });
    const s = liveSession(abs.open(ITEM));
    await expect(syncSession(s, SYNC_BODY, MIME), 'Expected an empty 200 body not to throw').resolves.toEqual(s);
  });

  it('REQ-22: rejects on a server error and does not open a new session', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs({ route: (c) => (c.url.endsWith('/sync') ? new Response('boom', { status: 500 }) : undefined) });
    const s = liveSession(abs.open(ITEM));
    await expect(syncSession(s, SYNC_BODY, MIME), 'Expected a 500 to reject').rejects.toThrow();
    expect(abs.to('POST', `/api/items/${ITEM}/play`), 'Expected only a 404 to trigger a re-open, not a 500').toHaveLength(0);
  });

  // Pause, kill the app -> the server holds the paused position (REQ-22), and another device resumes there (REQ-23).
  it('REQ-22: pausing after 3 s of listening saves the paused position on the server', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    const clock = tick(startClock(100), 3);
    expect(dueOnStop(clock, 103), 'Expected the pause to be a sync point').toBe(true);
    await syncSession(s, payload(clock, 103, 3600), MIME);
    expect(abs.progress.get(ITEM), 'Expected the server to hold 103 s with 3 s listened').toEqual({ currentTime: 103, timeListened: 3 });
  });

  it('REQ-23: another device opening the book resumes from the position the first device last synced', async () => {
    const { syncSession, openSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    await syncSession(s, { currentTime: 4210, timeListened: 8, duration: 3600 }, MIME);
    const other = await openSession(ITEM, MIME);
    expect(other.currentTime, 'Expected the second open to start at the last synced 4210 s').toBe(4210);
  });
});

describe('REQ-24: syncSession recovers when the server has lost the session', () => {
  it('REQ-24: a 404 opens a new session for the same item and syncs on it, in that order', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const old = liveSession(abs.open(ITEM)); // sess-1
    abs.restart();
    const active = await syncSession(old, SYNC_BODY, MIME);
    expect(abs.log(), 'Expected: sync (404), play again, then the same sync on the new session').toEqual([
      'POST /api/session/sess-1/sync',
      `POST /api/items/${ITEM}/play`,
      'POST /api/session/sess-2/sync',
    ]);
    expect(abs.to('POST', '/api/session/sess-2/sync')[0]?.body, 'Expected the original progress to be sent on the new session').toEqual(
      SYNC_BODY,
    );
    expect(active.id, 'Expected the resolved session to be the new one').toBe('sess-2');
    expect(abs.progress.get(ITEM)?.currentTime, 'Expected the server to hold the position after recovery').toBe(112);
  });

  it('REQ-24: the re-open asks for the same item with the same supported MIME types and device', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const old = liveSession(abs.open(ITEM));
    abs.restart();
    await syncSession(old, SYNC_BODY, MIME);
    const reopen = bodyOf(abs.to('POST', `/api/items/${ITEM}/play`)[0]);
    expect(reopen.supportedMimeTypes, 'Expected the MIME types passed to syncSession to be reused').toEqual(MIME);
    expect((reopen.deviceInfo as { clientName: string }).clientName, 'Expected the re-open to identify as Storyshelf').toBe('Storyshelf');
  });

  it('REQ-24: the new session is what the caller gets back, with its tracks and chapters', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const old = liveSession(abs.open(ITEM));
    abs.restart();
    const active = await syncSession(old, SYNC_BODY, MIME);
    expect(active, 'Expected a full PlaybackSession for the new session').toMatchObject({
      id: 'sess-2',
      libraryItemId: ITEM,
      duration: 3600,
      audioTracks: TRACKS,
      chapters: CHAPTERS,
    });
  });

  it('REQ-24: later syncs use the new session id and do not re-open again', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs();
    const old = liveSession(abs.open(ITEM));
    abs.restart();
    const active = await syncSession(old, SYNC_BODY, MIME);
    await syncSession(active, { currentTime: 130, timeListened: 18, duration: 3600 }, MIME);
    expect(abs.to('POST', '/api/session/sess-2/sync'), 'Expected the follow-up sync on the new id').toHaveLength(2);
    expect(abs.to('POST', `/api/items/${ITEM}/play`), 'Expected exactly one re-open in total').toHaveLength(1);
    expect(abs.to('POST', '/api/session/sess-1/sync'), 'Expected the dead id not to be used again').toHaveLength(1);
  });

  // The re-opened sync also fails: stop after one re-open and surface the failure.
  it.each([404, 500])('REQ-24: if the sync on the new session also fails with %i, it re-opens exactly once and rejects', async (status) => {
    const { syncSession } = await load();
    const abs = fakeAbs({ route: (c) => (c.url.endsWith('/sync') ? new Response('nope', { status }) : undefined) });
    const old = liveSession(abs.open(ITEM));
    await expect(syncSession(old, SYNC_BODY, MIME), 'Expected a rejection when the recovery sync fails too').rejects.toThrow();
    expect(abs.to('POST', `/api/items/${ITEM}/play`), 'Expected exactly one re-open, not a loop').toHaveLength(1);
    expect(abs.log().filter((l) => l.endsWith('/sync')), 'Expected two sync attempts: the original and the one on the new session').toHaveLength(2);
  });

  it('REQ-24: a re-open that is itself refused rejects without retrying', async () => {
    const { syncSession } = await load();
    const abs = fakeAbs({ route: (c) => (c.url.endsWith('/play') ? new Response('down', { status: 503 }) : undefined) });
    const old = liveSession(abs.open(ITEM));
    abs.restart();
    await expect(syncSession(old, SYNC_BODY, MIME), 'Expected a rejection when ABS cannot open a replacement session').rejects.toThrow();
    expect(abs.to('POST', `/api/items/${ITEM}/play`), 'Expected a single re-open attempt').toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// closeSession
// ---------------------------------------------------------------------------

describe('REQ-22: closeSession saves progress when the app is hidden or closed', () => {
  it('REQ-22: POSTs the final progress to /api/session/:id/close with keepalive so it survives page close', async () => {
    const { closeSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    await closeSession(s, SYNC_BODY);
    const closes = abs.to('POST', `/api/session/${s.id}/close`);
    expect(closes, 'Expected exactly one close request').toHaveLength(1);
    expect(closes[0]?.init.keepalive, 'Expected keepalive: true so the request outlives the page').toBe(true);
    expect(closes[0]?.body, 'Expected the final progress as the body').toEqual(SYNC_BODY);
    expect(closes[0]?.auth, 'Expected the bearer token on the close request').toBe(`Bearer ${ACCESS}`);
    expect(abs.progress.get(ITEM)?.currentTime, 'Expected the server to hold the closing position').toBe(112);
    expect(abs.sessions.has(s.id), 'Expected the server session to be closed').toBe(false);
  });

  it('REQ-22: closing without progress still sends the close with keepalive and an empty or absent body', async () => {
    const { closeSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    await closeSession(s);
    const close = abs.to('POST', `/api/session/${s.id}/close`)[0];
    expect(close, 'Expected a close request even without a progress body').toBeDefined();
    expect(close?.init.keepalive, 'Expected keepalive: true').toBe(true);
    expect(close?.body ?? {}, 'Expected no progress data in the body').toEqual({});
    expect(abs.sessions.has(s.id), 'Expected the server session to be closed').toBe(false);
  });

  it('REQ-22: resolves with no value on success', async () => {
    const { closeSession } = await load();
    const abs = fakeAbs();
    await expect(closeSession(liveSession(abs.open(ITEM)), SYNC_BODY), 'Expected closeSession to resolve to undefined').resolves.toBeUndefined();
  });

  it('REQ-22: never rejects when the network is down', async () => {
    const { closeSession } = await load();
    const abs = fakeAbs({ route: (c) => (c.url.endsWith('/close') ? Promise.reject(new TypeError('Failed to fetch')) : undefined) });
    const s = liveSession(abs.open(ITEM));
    await expect(closeSession(s, SYNC_BODY), 'Expected a network failure on close to be swallowed').resolves.toBeUndefined();
  });

  it.each([404, 500])('REQ-22: never rejects when the server answers %i', async (status) => {
    const { closeSession } = await load();
    const abs = fakeAbs({ route: (c) => (c.url.endsWith('/close') ? new Response('nope', { status }) : undefined) });
    const s = liveSession(abs.open(ITEM));
    await expect(closeSession(s, SYNC_BODY), `Expected a ${status} on close to be swallowed`).resolves.toBeUndefined();
  });

  it('REQ-22: does not open a replacement session when the close gets a 404', async () => {
    const { closeSession } = await load();
    const abs = fakeAbs();
    const s = liveSession(abs.open(ITEM));
    abs.restart();
    await closeSession(s, SYNC_BODY);
    expect(abs.log(), 'Expected close to be best effort: one request, no re-open').toEqual([`POST /api/session/${s.id}/close`]);
  });
});

// ---------------------------------------------------------------------------
// trackUrl
// ---------------------------------------------------------------------------

describe('REQ-21: trackUrl points <audio> at the public session track route', () => {
  it('REQ-21: builds /public/session/:sessionId/track/:index', async () => {
    const { trackUrl } = await load();
    expect(trackUrl(liveSession('sess-9'), 3), 'Expected the unauthenticated track route for the session').toBe('/public/session/sess-9/track/3');
  });

  it('REQ-21: uses the ABS track index as given, including 0 and 1', async () => {
    const { trackUrl } = await load();
    const s = liveSession('sess-9');
    expect(trackUrl(s, 0), 'Expected index 0 to be used as is').toBe('/public/session/sess-9/track/0');
    expect(trackUrl(s, 1), 'Expected index 1 to be used as is').toBe('/public/session/sess-9/track/1');
  });
});
