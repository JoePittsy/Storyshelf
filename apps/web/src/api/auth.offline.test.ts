/**
 * Offline is not signed out: apps/web/src/api/auth.ts with lastUser.ts and connectivity.ts.
 * A launch that can't reach the server runs as the user last signed in here (no token), offline. A real 401 still signs
 * out and forgets that user, as does signing out. The session renews quietly once the server answers again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AbsError,
  LAUNCH_WAIT_MS,
  absFetch,
  login,
  logout,
  onForgetUser,
  onSessionRenewed,
  onSignedOut,
  renewSession,
  resetAuthForTests,
  restoreSession,
} from './auth';
import { isOffline, markUnreachable, resetConnectivityForTests } from './connectivity';
import { rememberedUser } from './lastUser';
import { resetServerForTests, setMode, setServerUrl } from './server';

const LAST_USER = 'storyshelf.lastUser';

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const userBody = (accessToken: string) => ({
  user: {
    id: 'u1',
    username: 'joe',
    type: 'user',
    accessToken,
    refreshToken: 'REFRESH-TOKEN',
    token: 'LEGACY-TOKEN',
    permissions: { download: true },
    librariesAccessible: ['lib1'],
    mediaProgress: [{ id: 'p1' }],
  },
});

let store: Map<string, string>;
/** What the fake server does: answer, refuse, or be out of reach. */
let server: 'up' | 'down' | 'signed-out' | 'gateway' | 'hang';
/** While the server hangs: lets the held requests answer as the server now is. */
let release: () => void = () => undefined;
let issued: number;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  server = 'up';
  issued = 0;
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = input.replace(/^https?:\/\/[^/]+/, ''); // hosted mode prefixes the server
    await Promise.resolve();
    if (server === 'hang') await new Promise<void>((r) => (release = r));
    if (server === 'down') throw new TypeError('Failed to fetch');
    if (server === 'gateway') return new Response('Bad Gateway', { status: 502 });
    if (url === '/login' || url === '/auth/refresh') {
      if (server === 'signed-out') return new Response('Unauthorized', { status: 401 });
      issued += 1;
      return jsonRes(userBody(`access-${issued}`));
    }
    if (url === '/logout') return jsonRes({});
    const auth = new Headers(init.headers).get('authorization');
    return auth === `Bearer access-${issued}` ? jsonRes({ ok: true }) : new Response('Unauthorized', { status: 401 });
  });
});

afterEach(() => {
  resetAuthForTests();
  resetConnectivityForTests();
  resetServerForTests();
  vi.unstubAllGlobals();
});

describe('remembering who is signed in', () => {
  it('keeps what the screens need after signing in, and never a token', async () => {
    await login('joe', 'correct');
    expect(rememberedUser()).toEqual({
      id: 'u1',
      username: 'joe',
      type: 'user',
      permissions: { download: true },
      librariesAccessible: ['lib1'],
    });
    const raw = store.get(LAST_USER) ?? '';
    expect(raw).not.toMatch(/access-|REFRESH-TOKEN|LEGACY-TOKEN|mediaProgress/);
  });

  it('keeps it fresh on each renewal', async () => {
    await login('joe', 'correct');
    store.delete(LAST_USER);
    await restoreSession();
    expect(rememberedUser()?.username).toBe('joe');
  });

  it('belongs to the server it came from', async () => {
    setMode('hosted');
    setServerUrl('https://one.example.com');
    await login('joe', 'correct');
    expect(rememberedUser()?.username).toBe('joe');
    setServerUrl('https://two.example.com');
    expect(rememberedUser()).toBeNull();
  });
});

describe('restoreSession offline', () => {
  it('runs as the user last signed in here, without a token, and goes offline', async () => {
    await login('joe', 'correct');
    resetAuthForTests(); // a new launch: nothing in memory
    server = 'down';
    const user = await restoreSession();
    expect(user).toMatchObject({ id: 'u1', username: 'joe', accessToken: '' });
    expect(isOffline()).toBe(true);
  });

  it('treats a proxy that cannot reach ABS (502) the same way', async () => {
    await login('joe', 'correct');
    resetAuthForTests();
    server = 'gateway';
    await expect(restoreSession()).resolves.toMatchObject({ username: 'joe' });
    expect(isOffline()).toBe(true);
  });

  it('throws when nobody is remembered, so the app can say it needs a connection', async () => {
    server = 'down';
    await expect(restoreSession()).rejects.toBeInstanceOf(TypeError);
    expect(isOffline()).toBe(true);
  });

  it('a real 401 still signs out, and forgets the remembered user', async () => {
    await login('joe', 'correct');
    resetAuthForTests();
    const forgot = vi.fn();
    onForgetUser(forgot);
    server = 'signed-out';
    await expect(restoreSession()).resolves.toBeNull();
    expect(rememberedUser()).toBeNull();
    expect(forgot).toHaveBeenCalledTimes(1);
  });

  it('other server errors are not offline', async () => {
    await login('joe', 'correct');
    resetAuthForTests();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('Oops', { status: 500 })));
    await expect(restoreSession()).rejects.toBeInstanceOf(AbsError);
    expect(isOffline()).toBe(false);
  });
});

describe('signing out', () => {
  it('forgets the remembered user, even offline', async () => {
    await login('joe', 'correct');
    const forgot = vi.fn();
    const signedOut = vi.fn();
    onForgetUser(forgot);
    onSignedOut(signedOut);
    server = 'down';
    await logout();
    expect(rememberedUser()).toBeNull();
    expect(forgot).toHaveBeenCalledTimes(1);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });
});

describe('coming back online', () => {
  it('renews the session quietly and hands the fresh user on', async () => {
    await login('joe', 'correct');
    resetAuthForTests();
    server = 'down';
    await restoreSession();
    const renewed = vi.fn();
    onSessionRenewed(renewed);
    server = 'up';
    await renewSession();
    expect(renewed).toHaveBeenCalledWith(expect.objectContaining({ username: 'joe', accessToken: 'access-2' }));
    expect(isOffline()).toBe(false);
    await expect(absFetch('/api/me')).resolves.toEqual({ ok: true });
  });

  it('signs out as today when the renewal is refused', async () => {
    await login('joe', 'correct');
    resetAuthForTests();
    server = 'down';
    await restoreSession();
    const signedOut = vi.fn();
    onSignedOut(signedOut);
    server = 'signed-out';
    await expect(renewSession()).rejects.toMatchObject({ status: 401 });
    expect(signedOut).toHaveBeenCalledTimes(1);
    expect(rememberedUser()).toBeNull();
  });

  it('a renewal that still cannot reach the server changes nothing but staying offline', async () => {
    await login('joe', 'correct');
    resetAuthForTests();
    server = 'down';
    await restoreSession();
    const signedOut = vi.fn();
    onSignedOut(signedOut);
    await expect(renewSession()).rejects.toBeInstanceOf(TypeError);
    expect(signedOut).not.toHaveBeenCalled();
    expect(rememberedUser()?.username).toBe('joe');
    expect(isOffline()).toBe(true);
  });
});

describe('absFetch and connectivity', () => {
  it('a request that cannot reach the server goes offline, without signing out', async () => {
    await login('joe', 'correct');
    const signedOut = vi.fn();
    onSignedOut(signedOut);
    server = 'down';
    await expect(absFetch('/api/me')).rejects.toBeInstanceOf(TypeError);
    expect(isOffline()).toBe(true);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('any successful request brings it back online', async () => {
    await login('joe', 'correct');
    markUnreachable();
    await absFetch('/api/me');
    expect(isOffline()).toBe(false);
  });
});

describe('restoreSession on a connection that hangs', () => {
  afterEach(() => vi.useRealTimers());

  /** A new launch with joe remembered, the server not answering. */
  async function hangingLaunch() {
    await login('joe', 'correct');
    resetAuthForTests();
    server = 'hang';
    vi.useFakeTimers();
    const launch = restoreSession();
    await vi.advanceTimersByTimeAsync(LAUNCH_WAIT_MS);
    vi.useRealTimers();
    return launch;
  }

  it('opens offline as the remembered user after a short wait, instead of waiting on the server', async () => {
    await expect(hangingLaunch()).resolves.toMatchObject({ username: 'joe', accessToken: '' });
    expect(isOffline()).toBe(true);
  });

  it('keeps the renewal going: when the server answers, the session is renewed and the app is online', async () => {
    await hangingLaunch();
    const renewed = vi.fn();
    onSessionRenewed(renewed);
    server = 'up';
    release();
    await vi.waitFor(() => expect(renewed).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access-2' })));
    expect(isOffline()).toBe(false);
  });

  it('shares that renewal with a retry, so the refresh token is never spent twice', async () => {
    await hangingLaunch();
    const retry = renewSession();
    server = 'up';
    release();
    await expect(retry).resolves.toMatchObject({ accessToken: 'access-2' });
    expect(issued).toBe(2); // the sign-in and one renewal
  });

  it('signs out if the server finally says the session is over', async () => {
    await hangingLaunch();
    const out = vi.fn();
    onSignedOut(out);
    server = 'signed-out';
    release();
    await vi.waitFor(() => expect(out).toHaveBeenCalledTimes(1));
    expect(rememberedUser()).toBeNull();
  });

  it('with nobody remembered, it waits for the server as before', async () => {
    server = 'hang';
    vi.useFakeTimers();
    let settled = false;
    void restoreSession().finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(LAUNCH_WAIT_MS * 3);
    expect(settled).toBe(false);
    server = 'up';
    release();
  });
});
