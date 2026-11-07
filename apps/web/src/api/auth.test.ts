/**
 * Tests for Storyshelf's Audiobookshelf (ABS) auth/session client.
 * Code under test: apps/web/src/api/auth.ts
 *
 * Requirements covered (IDs appear in the describe/test names):
 *  REQ-4  You sign in with username and password and stay signed in across restarts.
 *  REQ-5  An expired session renews without you noticing.
 *  REQ-6  Clear message for wrong password, too-old server, or SSO-only server.
 *  REQ-7  Signing out returns you to sign-in, and reopening asks you to sign in.
 *  REQ-8  Storyshelf talks to the ABS server on its own origin, no URL field.
 *
 * Design facts the tests rely on (ABS v2.37.2):
 *  - Access token is held in memory only; the refresh token is ABS's httpOnly
 *    `refresh_token` cookie, so auth requests use `credentials: 'include'` and
 *    the client never sends `x-return-tokens` or `x-refresh-token`.
 *  - Login/refresh responses carry `user.accessToken`; the legacy `user.token`
 *    must be ignored.
 *  - All requests go to relative paths (same origin).
 *
 * `fetch` is stubbed with a small fake ABS server; there is no network and no MSW.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AbsError,
  UnsupportedServerError,
  absFetch,
  assertSupported,
  getStatus,
  login,
  logout,
  onSignedOut,
  resetAuthForTests,
  restoreSession,
  type ServerStatus,
  type UnsupportedReason,
} from './auth';

// ---------------------------------------------------------------------------
// Fake ABS server
// ---------------------------------------------------------------------------

interface Rec {
  url: string;
  method: string;
  init: RequestInit;
  /** Value of the Authorization header, or null if absent. */
  auth: string | null;
}

type Handler = (rec: Rec) => Response | Promise<Response>;

const jsonRes = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const textRes = (text: string, status: number): Response => new Response(text, { status });

const headerOf = (init: RequestInit, name: string): string | null => new Headers(init.headers).get(name);

const userBody = (accessToken: string) => ({
  user: {
    id: 'u1',
    username: 'joe',
    accessToken,
    refreshToken: null,
    token: 'LEGACY-TOKEN',
    mediaProgress: [],
  },
  userDefaultLibraryId: 'lib1',
  serverSettings: {},
});

const STATUS_BODY = {
  app: 'audiobookshelf',
  serverVersion: '2.37.2',
  isInit: true,
  language: 'en-us',
  authMethods: ['local'],
  authFormData: {},
};

/** Replaces globalThis.fetch with `handler` and returns the live call log. */
function installFetch(handler: Handler): Rec[] {
  const calls: Rec[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rec: Rec = {
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      init,
      auth: headerOf(init, 'authorization'),
    };
    calls.push(rec);
    return Promise.resolve().then(() => handler(rec));
  });
  return calls;
}

/**
 * Stateful fake: valid credentials are joe / correct. Each login or refresh
 * issues a new access token (access-1, access-2, ...). Any other path is an
 * "authenticated route" that only accepts the current access token.
 */
function absServer() {
  const state = {
    validAccess: '',
    cookie: false,
    issued: 0,
    gate: null as Promise<void> | null,
  };
  const issue = (): string => {
    state.issued += 1;
    state.validAccess = `access-${state.issued}`;
    return state.validAccess;
  };
  const calls = installFetch(async (r) => {
    switch (`${r.method} ${r.url}`) {
      case 'GET /status':
        return jsonRes(STATUS_BODY);
      case 'POST /login': {
        const b = JSON.parse(String(r.init.body)) as { username?: string; password?: string };
        if (b.username === 'joe' && b.password === 'correct') {
          state.cookie = true;
          return jsonRes(userBody(issue()));
        }
        return textRes('Unauthorized', 401);
      }
      case 'POST /auth/refresh':
        if (state.gate) await state.gate;
        return state.cookie ? jsonRes(userBody(issue())) : textRes('Unauthorized', 401);
      case 'POST /logout':
        state.cookie = false;
        state.validAccess = '';
        return jsonRes({ redirect_url: null });
      default:
        return r.auth === `Bearer ${state.validAccess}` ? jsonRes({ path: r.url }) : textRes('Unauthorized', 401);
    }
  });
  return {
    calls,
    state,
    /** Simulates the access token timing out while the cookie stays valid. */
    expireAccessToken: () => {
      state.validAccess = 'expired';
    },
    /** Holds /auth/refresh open until the returned function is called. */
    holdRefresh: (): (() => void) => {
      let release: () => void = () => undefined;
      state.gate = new Promise<void>((res) => {
        release = res;
      });
      return release;
    },
  };
}

const refreshCalls = (calls: Rec[]) => calls.filter((c) => c.method === 'POST' && c.url === '/auth/refresh');
const callsTo = (calls: Rec[], url: string) => calls.filter((c) => c.url === url);

// ---------------------------------------------------------------------------
// Test plumbing
// ---------------------------------------------------------------------------

const unsubscribers: Array<() => void> = [];
/** Registers a spy listener with onSignedOut and cleans it up after the test. */
function listen() {
  const spy = vi.fn();
  unsubscribers.push(onSignedOut(spy));
  return spy;
}

const fakeStorage = () => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(() => null),
  length: 0,
});
let local: ReturnType<typeof fakeStorage>;
let session: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  local = fakeStorage();
  session = fakeStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
});

afterEach(() => {
  unsubscribers.splice(0).forEach((u) => u());
  resetAuthForTests();
  vi.unstubAllGlobals();
});

/** Returns whatever `fn` throws (fails the test if it does not throw). */
function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('Expected the function to throw, but it returned normally.');
}

// ---------------------------------------------------------------------------
// REQ-6: Clear message for too-old server or SSO-only server
// ---------------------------------------------------------------------------

describe('REQ-6: assertSupported (server compatibility check)', () => {
  const status = (over: Partial<ServerStatus> = {}): ServerStatus => ({
    serverVersion: '2.37.2',
    authMethods: ['local'],
    isInit: true,
    ...over,
  });

  // Given a server on 2.26.0 or newer with local auth, assertSupported does not throw.
  // Code path: assertSupported in apps/web/src/api/auth.ts.
  it.each(['2.26.0', '2.26.1', '2.37.2', '2.100.0', '3.0.0'])(
    'REQ-6: accepts Audiobookshelf %s (2.26 or newer)',
    (serverVersion) => {
      expect(
        () => assertSupported(status({ serverVersion })),
        `Expected server version ${serverVersion} to be supported (minimum is 2.26.0)`
      ).not.toThrow();
    }
  );

  // Given a server older than 2.26 (compared numerically, not as text), assertSupported
  // throws UnsupportedServerError with reason 'version', so the UI can say
  // "Storyshelf needs Audiobookshelf 2.26 or newer."
  it.each(['2.25.9', '2.25.0', '2.3.0', '2.9.0', '1.9.9'])(
    "REQ-6: rejects Audiobookshelf %s with reason 'version'",
    (serverVersion) => {
      const err = thrownBy(() => assertSupported(status({ serverVersion })));
      expect(err, `Expected an UnsupportedServerError for server ${serverVersion}`).toBeInstanceOf(
        UnsupportedServerError
      );
      expect((err as UnsupportedServerError).reason, `Expected reason 'version' for ${serverVersion}`).toBe(
        'version' satisfies UnsupportedReason
      );
    }
  );

  // Given a server whose authMethods lack 'local' (SSO-only), assertSupported throws
  // reason 'no-local-auth'.
  it("REQ-6: rejects an SSO-only server (no 'local' in authMethods) with reason 'no-local-auth'", () => {
    const err = thrownBy(() => assertSupported(status({ authMethods: ['openid'] })));
    expect(err, "Expected UnsupportedServerError when authMethods is ['openid']").toBeInstanceOf(
      UnsupportedServerError
    );
    expect((err as UnsupportedServerError).reason, "Expected reason 'no-local-auth'").toBe('no-local-auth');
  });

  // Local auth alongside SSO is still usable: Storyshelf signs in with the local form.
  it("REQ-6: accepts a server offering both 'local' and 'openid'", () => {
    expect(
      () => assertSupported(status({ authMethods: ['local', 'openid'] })),
      "Expected a server offering 'local' alongside 'openid' to be supported"
    ).not.toThrow();
  });

  // Given a server that has not been set up (isInit false), assertSupported throws
  // reason 'not-initialised'.
  it("REQ-6: rejects a server that has not been set up with reason 'not-initialised'", () => {
    const err = thrownBy(() => assertSupported(status({ isInit: false })));
    expect(err, 'Expected UnsupportedServerError when isInit is false').toBeInstanceOf(UnsupportedServerError);
    expect((err as UnsupportedServerError).reason, "Expected reason 'not-initialised'").toBe('not-initialised');
  });
});

describe('REQ-6: getStatus', () => {
  // Given a reachable server, getStatus GETs /status without credentials-bearing
  // headers and returns serverVersion, authMethods and isInit.
  it('REQ-6: GETs /status with no Authorization header and returns the server status', async () => {
    const { calls } = absServer();
    const result = await getStatus();
    expect(calls, 'Expected exactly one request').toHaveLength(1);
    expect(calls[0]?.url, 'Expected a relative GET to /status').toBe('/status');
    expect(calls[0]?.method, 'Expected GET').toBe('GET');
    expect(calls[0]?.auth, 'Expected /status to be requested without Authorization').toBeNull();
    expect(result.serverVersion, 'Expected serverVersion from the response').toBe('2.37.2');
    expect(result.authMethods, 'Expected authMethods from the response').toEqual(['local']);
    expect(result.isInit, 'Expected isInit from the response').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// REQ-4: sign in and stay signed in
// ---------------------------------------------------------------------------

describe('REQ-4: login (sign in with username and password)', () => {
  // POST /login with a JSON body of exactly {username, password}, cookie included.
  it('REQ-4: POSTs {username, password} as JSON to /login with credentials included', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    const req = callsTo(calls, '/login')[0];
    expect(req, 'Expected a request to /login').toBeDefined();
    expect(req?.method, 'Expected POST').toBe('POST');
    expect(req?.init.credentials, "Expected credentials: 'include' so ABS can set its refresh cookie").toBe('include');
    expect(headerOf(req?.init ?? {}, 'content-type'), 'Expected a JSON content type').toMatch(/application\/json/);
    expect(JSON.parse(String(req?.init.body)), 'Expected the body to hold only username and password').toEqual({
      username: 'joe',
      password: 'correct',
    });
  });

  // The refresh token lives in the httpOnly cookie, so the client must not ask for
  // or send tokens in headers.
  it('REQ-4: never sends x-return-tokens or x-refresh-token on login', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    const init = callsTo(calls, '/login')[0]?.init ?? {};
    expect(headerOf(init, 'x-return-tokens'), 'Expected no x-return-tokens header').toBeNull();
    expect(headerOf(init, 'x-refresh-token'), 'Expected no x-refresh-token header').toBeNull();
  });

  it('REQ-4: resolves with the signed-in user including accessToken', async () => {
    absServer();
    const user = await login('joe', 'correct');
    expect(user.id, 'Expected the user id from the response').toBe('u1');
    expect(user.username, 'Expected the username from the response').toBe('joe');
    expect(user.accessToken, 'Expected user.accessToken from the response').toBe('access-1');
  });

  // Later requests authenticate with Bearer <accessToken>, never the legacy `token`.
  it('REQ-4: authenticated requests send Bearer <accessToken> and ignore the legacy token', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    await absFetch('/api/me');
    const req = callsTo(calls, '/api/me')[0];
    expect(req?.auth, 'Expected Authorization: Bearer access-1 (the accessToken, not the legacy token)').toBe(
      'Bearer access-1'
    );
  });

  // Bad credentials: ABS answers 401 with text "Unauthorized". REQ-6 wants a clear
  // wrong-password message, which the UI derives from AbsError.status === 401.
  it('REQ-6: wrong password rejects with AbsError status 401', async () => {
    absServer();
    const err = await login('joe', 'wrong').catch((e: unknown) => e);
    expect(err, 'Expected login to reject for a wrong password').toBeInstanceOf(AbsError);
    expect((err as AbsError).status, 'Expected AbsError.status 401').toBe(401);
  });

  // A failed sign-in must not be mistaken for an expired session: no refresh, no retry.
  it('REQ-6: a 401 from /login does not trigger a token refresh or retry', async () => {
    const { calls } = absServer();
    await login('joe', 'wrong').catch(() => undefined);
    expect(calls, 'Expected only the single /login request').toHaveLength(1);
    expect(refreshCalls(calls), 'Expected no /auth/refresh after a failed login').toHaveLength(0);
  });

  it('REQ-6: rate limiting rejects with AbsError status 429', async () => {
    installFetch(() => textRes('Too many attempts', 429));
    const err = await login('joe', 'correct').catch((e: unknown) => e);
    expect(err, 'Expected login to reject when rate limited').toBeInstanceOf(AbsError);
    expect((err as AbsError).status, 'Expected AbsError.status 429').toBe(429);
  });

  // The access token is memory-only; the refresh token is an httpOnly cookie.
  it('REQ-4: never writes tokens to localStorage or sessionStorage', async () => {
    const server = absServer();
    await login('joe', 'correct');
    await absFetch('/api/me');
    server.expireAccessToken();
    await absFetch('/api/me'); // forces a refresh and a new token
    await logout();
    for (const [name, store] of [
      ['localStorage', local],
      ['sessionStorage', session],
    ] as const) {
      expect(store.setItem, `Expected no writes to ${name}: tokens must stay in memory`).not.toHaveBeenCalled();
    }
  });
});

describe('REQ-4: restoreSession (stay signed in across restarts)', () => {
  // On startup, POST /auth/refresh with the cookie. 200 → user, token held in memory.
  it('REQ-4: POSTs /auth/refresh with credentials included and returns the user', async () => {
    const { calls, state } = absServer();
    state.cookie = true; // a previous visit left the refresh cookie behind
    const user = await restoreSession();
    const req = refreshCalls(calls)[0];
    expect(req, 'Expected a POST to /auth/refresh').toBeDefined();
    expect(req?.init.credentials, "Expected credentials: 'include' so the cookie is sent").toBe('include');
    expect(headerOf(req?.init ?? {}, 'x-return-tokens'), 'Expected no x-return-tokens header').toBeNull();
    expect(headerOf(req?.init ?? {}, 'x-refresh-token'), 'Expected no x-refresh-token header').toBeNull();
    expect(user?.accessToken, 'Expected the user from the refresh response with its new accessToken').toBe('access-1');
  });

  it('REQ-4: after restoring, authenticated requests send the new Bearer token', async () => {
    const { calls, state } = absServer();
    state.cookie = true;
    await restoreSession();
    await absFetch('/api/me');
    expect(callsTo(calls, '/api/me')[0]?.auth, 'Expected Authorization: Bearer access-1 after restoreSession').toBe(
      'Bearer access-1'
    );
  });

  // Simulates close and reopen: in-memory state is gone, the cookie remains.
  it('REQ-4: a reopened app with a valid cookie is signed in again without a login', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    resetAuthForTests(); // the PWA is closed: memory is wiped, the cookie survives
    const user = await restoreSession();
    expect(user?.username, 'Expected restoreSession to return the user from the cookie').toBe('joe');
    expect(callsTo(calls, '/login'), 'Expected no second login').toHaveLength(1);
  });

  // 401 means "no valid session": the app shows sign-in. Not an error.
  it('REQ-4: resolves null (does not throw) when the refresh cookie is missing or expired', async () => {
    const { state } = absServer();
    state.cookie = false;
    await expect(restoreSession(), 'Expected null for a 401 from /auth/refresh').resolves.toBeNull();
  });

  it('REQ-4: after a 401 from /auth/refresh no Bearer token is sent on later requests', async () => {
    const { calls, state } = absServer();
    state.cookie = false;
    await restoreSession();
    await absFetch('/api/me').catch(() => undefined);
    expect(
      calls.filter((c) => c.url === '/api/me' && c.auth !== null),
      'Expected no Authorization header when there is no session'
    ).toHaveLength(0);
  });

  // Offline is not signed out: a network failure must surface as a rejection and
  // must not announce a sign-out, so the app can retry rather than show the login.
  it('REQ-4: rejects (does not resolve null) when the network is down', async () => {
    installFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      restoreSession(),
      'Expected a network failure to reject, so offline differs from signed-out'
    ).rejects.toThrow('Failed to fetch');
  });

  it('REQ-4: a network failure during restore does not notify onSignedOut', async () => {
    installFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const signedOut = listen();
    await restoreSession().catch(() => undefined);
    expect(signedOut, 'Expected no sign-out notification when merely offline').not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// REQ-5: an expired session renews without you noticing (absFetch)
// ---------------------------------------------------------------------------

describe('REQ-5: absFetch (authenticated requests with silent renewal)', () => {
  it('REQ-5: GETs the relative path with Bearer token and parses the JSON response', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    const data = await absFetch<{ path: string }>('/api/items/li_1');
    const req = callsTo(calls, '/api/items/li_1')[0];
    expect(req?.method, 'Expected GET by default').toBe('GET');
    expect(req?.auth, 'Expected Authorization: Bearer access-1').toBe('Bearer access-1');
    expect(data, 'Expected the parsed JSON body').toEqual({ path: '/api/items/li_1' });
  });

  it('REQ-5: forwards method, body and other headers while adding the Authorization header', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    await absFetch('/api/me/progress', {
      method: 'PATCH',
      body: JSON.stringify({ currentTime: 12 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const req = callsTo(calls, '/api/me/progress')[0];
    expect(req?.method, 'Expected the caller-supplied method').toBe('PATCH');
    expect(req?.init.body, 'Expected the caller-supplied body').toBe(JSON.stringify({ currentTime: 12 }));
    expect(headerOf(req?.init ?? {}, 'content-type'), 'Expected caller-supplied headers to be kept').toBe(
      'application/json'
    );
    expect(req?.auth, 'Expected the Authorization header to be added').toBe('Bearer access-1');
  });

  // Expired access token: 401, then ONE refresh, then ONE retry with the new token.
  it('REQ-5: on 401 refreshes once, retries with the new token and returns the data', async () => {
    const server = absServer();
    await login('joe', 'correct');
    server.expireAccessToken();
    const data = await absFetch<{ path: string }>('/api/me');

    const sequence = server.calls.slice(1).map((c) => `${c.method} ${c.url} ${c.auth ?? '-'}`);
    expect(sequence, 'Expected: original (old token), refresh, retry (new token)').toEqual([
      'GET /api/me Bearer access-1',
      'POST /auth/refresh -',
      'GET /api/me Bearer access-2',
    ]);
    expect(refreshCalls(server.calls)[0]?.init.credentials, "Expected the refresh to use credentials: 'include'").toBe(
      'include'
    );
    expect(data, 'Expected the caller to receive the retried response, none the wiser').toEqual({ path: '/api/me' });
  });

  it('REQ-5: after a renewal later requests use the new token without refreshing again', async () => {
    const server = absServer();
    await login('joe', 'correct');
    server.expireAccessToken();
    await absFetch('/api/me');
    await absFetch('/api/libraries');
    expect(callsTo(server.calls, '/api/libraries')[0]?.auth, 'Expected the renewed token to be reused').toBe(
      'Bearer access-2'
    );
    expect(refreshCalls(server.calls), 'Expected exactly one refresh in total').toHaveLength(1);
  });

  // Several requests fail together (e.g. the app wakes after two hours): only one
  // refresh, because ABS rotates the refresh token and parallel refreshes would race.
  it('REQ-5: concurrent 401s share a single refresh and every request is retried with the new token', async () => {
    const server = absServer();
    await login('joe', 'correct');
    server.expireAccessToken();
    const release = server.holdRefresh();

    const paths = ['/api/a', '/api/b', '/api/c'];
    const pending = paths.map((p) => absFetch<{ path: string }>(p));
    // Wait until all three originals have been sent and have received their 401.
    await vi.waitFor(() =>
      expect(
        server.calls.filter((c) => paths.includes(c.url)),
        'Expected all three requests to be sent before the refresh completes'
      ).toHaveLength(3)
    );
    await new Promise((r) => setTimeout(r, 10));
    release();
    const results = await Promise.all(pending);

    expect(refreshCalls(server.calls), 'Expected ONE /auth/refresh shared by all three 401s').toHaveLength(1);
    expect(results, 'Expected each caller to get its own retried response').toEqual(paths.map((path) => ({ path })));
    for (const p of paths) {
      const sent = callsTo(server.calls, p);
      expect(sent, `Expected ${p} to be sent twice (original and one retry)`).toHaveLength(2);
      expect(sent[1]?.auth, `Expected the retry of ${p} to carry the new token`).toBe('Bearer access-2');
    }
  });

  // Session genuinely over (cookie expired/revoked): sign out once, everywhere.
  it('REQ-5: when the refresh fails it rejects with AbsError 401 and notifies onSignedOut once', async () => {
    const server = absServer();
    await login('joe', 'correct');
    const signedOut = listen();
    server.expireAccessToken();
    server.state.cookie = false;

    const err = await absFetch('/api/me').catch((e: unknown) => e);
    expect(err, 'Expected absFetch to reject when renewal fails').toBeInstanceOf(AbsError);
    expect((err as AbsError).status, 'Expected AbsError.status 401').toBe(401);
    expect(signedOut, 'Expected onSignedOut listeners to be called exactly once').toHaveBeenCalledTimes(1);
  });

  it('REQ-5: when the refresh fails the stale access token is no longer sent', async () => {
    const server = absServer();
    await login('joe', 'correct');
    server.expireAccessToken();
    server.state.cookie = false;
    await absFetch('/api/me').catch(() => undefined);
    const before = server.calls.length;
    await absFetch('/api/later').catch(() => undefined);
    expect(
      server.calls.slice(before).filter((c) => c.auth === 'Bearer access-1'),
      'Expected the cleared access token not to be reused after a failed renewal'
    ).toHaveLength(0);
  });

  it('REQ-5: concurrent requests with a failed refresh all reject with AbsError 401 and sign out only once', async () => {
    const server = absServer();
    await login('joe', 'correct');
    const signedOut = listen();
    server.expireAccessToken();
    server.state.cookie = false;
    const release = server.holdRefresh();

    const pending = ['/api/a', '/api/b', '/api/c'].map((p) => absFetch(p));
    const settled = Promise.allSettled(pending);
    await new Promise((r) => setTimeout(r, 10));
    release();
    const results = await settled;

    expect(refreshCalls(server.calls), 'Expected ONE refresh attempt shared by all requests').toHaveLength(1);
    for (const r of results) {
      expect(r.status, 'Expected every request to reject').toBe('rejected');
      const reason = r.status === 'rejected' ? (r.reason as unknown) : null;
      expect(reason, 'Expected AbsError').toBeInstanceOf(AbsError);
      expect((reason as AbsError).status, 'Expected AbsError.status 401').toBe(401);
    }
    expect(signedOut, 'Expected a single sign-out notification, not one per request').toHaveBeenCalledTimes(1);
  });

  // If the retry is also 401 the client must give up, not refresh in a loop.
  it('REQ-5: does not loop when the retried request is also 401', async () => {
    const calls = installFetch((r) => {
      if (r.url === '/login') return jsonRes(userBody('access-1'));
      if (r.url === '/auth/refresh') return jsonRes(userBody('access-2'));
      return textRes('Unauthorized', 401); // /api/forbidden always 401
    });
    await login('joe', 'correct');
    const err = await absFetch('/api/forbidden').catch((e: unknown) => e);

    expect(err, 'Expected a rejection after the retry also fails').toBeInstanceOf(AbsError);
    expect((err as AbsError).status, 'Expected AbsError.status 401').toBe(401);
    expect(refreshCalls(calls), 'Expected exactly one refresh, no loop').toHaveLength(1);
    expect(callsTo(calls, '/api/forbidden'), 'Expected the request sent twice: original and one retry').toHaveLength(2);
  });

  // Not an expired-session problem: report it as is, leave the session alone.
  it.each([403, 404, 500])('REQ-5: a %i response rejects with AbsError(%i) without refreshing', async (status) => {
    const calls = installFetch((r) => (r.url === '/login' ? jsonRes(userBody('access-1')) : textRes('nope', status)));
    await login('joe', 'correct');
    const err = await absFetch('/api/items/missing').catch((e: unknown) => e);
    expect(err, `Expected a ${status} to reject`).toBeInstanceOf(AbsError);
    expect((err as AbsError).status, `Expected AbsError.status ${status}`).toBe(status);
    expect(refreshCalls(calls), `Expected no refresh for a ${status}`).toHaveLength(0);
    expect(callsTo(calls, '/api/items/missing'), `Expected no retry for a ${status}`).toHaveLength(1);
  });

  it('REQ-5: a network failure rejects without refreshing or signing out', async () => {
    let up = true;
    const calls = installFetch((r) => {
      if (r.url === '/login') return jsonRes(userBody('access-1'));
      if (!up) throw new TypeError('Failed to fetch');
      return jsonRes({});
    });
    await login('joe', 'correct');
    const signedOut = listen();
    up = false;
    await expect(absFetch('/api/me'), 'Expected the network error to propagate').rejects.toThrow('Failed to fetch');
    expect(refreshCalls(calls), 'Expected no refresh for a network failure').toHaveLength(0);
    expect(signedOut, 'Expected no sign-out when merely offline').not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// REQ-7: signing out
// ---------------------------------------------------------------------------

describe('REQ-7: logout (signing out)', () => {
  it('REQ-7: POSTs /logout with credentials included', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    await logout();
    const req = callsTo(calls, '/logout')[0];
    expect(req, 'Expected a request to /logout').toBeDefined();
    expect(req?.method, 'Expected POST').toBe('POST');
    expect(req?.init.credentials, "Expected credentials: 'include' so ABS can clear the refresh cookie").toBe(
      'include'
    );
  });

  it('REQ-7: notifies onSignedOut listeners once so the UI returns to sign-in', async () => {
    absServer();
    await login('joe', 'correct');
    const signedOut = listen();
    await logout();
    expect(signedOut, 'Expected onSignedOut to be called exactly once').toHaveBeenCalledTimes(1);
  });

  it('REQ-7: clears the in-memory access token', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    await logout();
    const before = calls.length;
    await absFetch('/api/me').catch(() => undefined);
    expect(
      calls.slice(before).filter((c) => c.auth === 'Bearer access-1'),
      'Expected the old access token not to be sent after logout'
    ).toHaveLength(0);
  });

  // "Sign out, reload: sign-in screen." After logout the cookie is gone, so a fresh
  // start must ask the server (not remember a user in memory) and get null.
  it('REQ-7: reopening after sign-out finds no session and asks you to sign in', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    await logout();
    resetAuthForTests(); // reload
    const user = await restoreSession();
    expect(user, 'Expected null after sign-out, so the sign-in screen is shown').toBeNull();
    expect(refreshCalls(calls), 'Expected restoreSession to consult the server').toHaveLength(1);
  });

  it('REQ-7: restoreSession right after logout (no reload) does not resurrect the session', async () => {
    absServer();
    await login('joe', 'correct');
    await logout();
    await expect(restoreSession(), 'Expected null: logout must not leave a cached user').resolves.toBeNull();
  });

  // Even if the server cannot be reached, the user must end up signed out locally.
  it('REQ-7: still clears local state and notifies when the /logout request fails (network)', async () => {
    let down = false;
    const calls = installFetch((r) => {
      if (r.url === '/login') return jsonRes(userBody('access-1'));
      if (down) throw new TypeError('Failed to fetch');
      return jsonRes({});
    });
    await login('joe', 'correct');
    const signedOut = listen();
    down = true;
    await logout().catch(() => undefined);
    down = false;
    const before = calls.length;
    await absFetch('/api/me').catch(() => undefined);

    expect(signedOut, 'Expected onSignedOut even though /logout failed').toHaveBeenCalledTimes(1);
    expect(
      calls.slice(before).filter((c) => c.auth === 'Bearer access-1'),
      'Expected the access token to be cleared even though /logout failed'
    ).toHaveLength(0);
  });

  it('REQ-7: still clears local state and notifies when /logout answers 500', async () => {
    const calls = installFetch((r) =>
      r.url === '/login' ? jsonRes(userBody('access-1')) : r.url === '/logout' ? textRes('boom', 500) : jsonRes({})
    );
    await login('joe', 'correct');
    const signedOut = listen();
    await logout().catch(() => undefined);
    const before = calls.length;
    await absFetch('/api/me').catch(() => undefined);

    expect(signedOut, 'Expected onSignedOut even though /logout answered 500').toHaveBeenCalledTimes(1);
    expect(
      calls.slice(before).filter((c) => c.auth === 'Bearer access-1'),
      'Expected the access token to be cleared even though /logout answered 500'
    ).toHaveLength(0);
  });
});

describe('REQ-7: onSignedOut subscription', () => {
  it('REQ-7: every subscribed listener is notified on logout', async () => {
    absServer();
    await login('joe', 'correct');
    const a = listen();
    const b = listen();
    await logout();
    expect(a, 'Expected the first listener to be called').toHaveBeenCalledTimes(1);
    expect(b, 'Expected the second listener to be called').toHaveBeenCalledTimes(1);
  });

  it('REQ-7: the function returned by onSignedOut unsubscribes that listener', async () => {
    absServer();
    await login('joe', 'correct');
    const kept = vi.fn();
    const dropped = vi.fn();
    unsubscribers.push(onSignedOut(kept));
    const unsubscribe = onSignedOut(dropped);
    unsubscribe();
    await logout();
    expect(dropped, 'Expected an unsubscribed listener not to be called').not.toHaveBeenCalled();
    expect(kept, 'Expected the remaining listener to still be called').toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test helper contract
// ---------------------------------------------------------------------------

describe('resetAuthForTests (module state reset)', () => {
  // Other tests depend on this: state must not leak between tests.
  it('REQ-4: clears the in-memory access token', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    resetAuthForTests();
    const before = calls.length;
    await absFetch('/api/me').catch(() => undefined);
    expect(
      calls.slice(before).filter((c) => c.auth === 'Bearer access-1'),
      'Expected resetAuthForTests to forget the access token'
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-8: same origin, no server URL
// ---------------------------------------------------------------------------

describe('REQ-8: same-origin requests, no server URL', () => {
  // The sign-in form has only username and password, so login takes just those.
  it('REQ-8: login takes only a username and password and sends nothing else', async () => {
    const { calls } = absServer();
    await login('joe', 'correct');
    const body = JSON.parse(String(callsTo(calls, '/login')[0]?.init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort(), 'Expected the login body to have only username and password').toEqual([
      'password',
      'username',
    ]);
  });

  // The whole lifecycle uses origin-relative paths: no scheme, no host, no protocol-relative URL.
  it('REQ-8: every request across status, login, renewal, API call and logout uses an origin-relative path', async () => {
    const server = absServer();
    await getStatus();
    await login('joe', 'correct');
    await absFetch('/api/me');
    server.expireAccessToken();
    await absFetch('/api/me'); // triggers /auth/refresh
    await logout();

    const urls = server.calls.map((c) => c.url);
    expect(urls, 'Expected the lifecycle to exercise /status, /login, /auth/refresh and /logout').toEqual(
      expect.arrayContaining(['/status', '/login', '/auth/refresh', '/logout'])
    );
    for (const url of urls) {
      expect(url, `Expected ${url} to be a path on the app's own origin (starting with a single "/")`).toMatch(
        /^\/(?!\/)/
      );
    }
  });
});
