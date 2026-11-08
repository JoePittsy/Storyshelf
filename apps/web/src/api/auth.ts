import { isNetworkError, markReachable, markUnreachable } from './connectivity';
import { forgetUser, rememberUser, rememberedUser } from './lastUser';
import { absUrl, setServerUrl } from './server';
import { transport } from './transport';
import type { AbsUser, LoginResponse, RefreshResponse, ServerStatus } from './types';

export type { AbsUser, ServerStatus };

export class AbsError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'AbsError';
  }
}

export type UnsupportedReason = 'version' | 'no-local-auth' | 'not-initialised';

export class UnsupportedServerError extends Error {
  constructor(public reason: UnsupportedReason) {
    super(reason);
    this.name = 'UnsupportedServerError';
  }
}

const MIN_VERSION = [2, 26, 0];

// Access token lives in memory only. The refresh token stays in ABS's httpOnly cookie (same-origin mode)
// or in localStorage (hosted mode); see transport.ts.
let accessToken: string | null = null;
let refreshing: Promise<AbsUser> | null = null;
const listeners = new Set<() => void>();
const forgetListeners = new Set<() => void>();
const renewedListeners = new Set<(user: AbsUser) => void>();

async function check(res: Response): Promise<Response> {
  if (!res.ok) throw new AbsError(res.status, (await res.text().catch(() => '')) || res.statusText);
  return res;
}

/** The session is over on this device: nothing of it, or of the user's data, stays behind. */
function forget(): void {
  accessToken = null;
  transport().clear();
  forgetUser();
  forgetListeners.forEach((cb) => cb());
}

function signedOut(): void {
  forget();
  listeners.forEach((cb) => cb());
}

/** A user ABS has just vouched for: hold the token, keep the copy offline needs, and note the server is reachable. */
function adopt(user: AbsUser): void {
  accessToken = user.accessToken;
  transport().adopt(user);
  rememberUser(user);
  markReachable();
}

export async function getStatus(): Promise<ServerStatus> {
  return (await check(await fetch(absUrl('/status')))).json() as Promise<ServerStatus>;
}

export function assertSupported(s: ServerStatus): void {
  const v = s.serverVersion.split('.').map((n) => parseInt(n, 10) || 0);
  const older = (() => {
    for (const [i, min] of MIN_VERSION.entries()) {
      const cur = v[i] ?? 0;
      if (cur !== min) return cur < min;
    }
    return false;
  })();
  if (older) throw new UnsupportedServerError('version');
  if (!s.authMethods.includes('local')) throw new UnsupportedServerError('no-local-auth');
  if (!s.isInit) throw new UnsupportedServerError('not-initialised');
}

/** Hosted mode: point at a (different) server. The old server's session means nothing to the new one. */
export function changeServer(url: string): void {
  transport().clear();
  setServerUrl(url);
}

export async function login(username: string, password: string): Promise<AbsUser> {
  const res = await check(await transport().login(username, password));
  const { user } = (await res.json()) as LoginResponse;
  adopt(user);
  return user;
}

async function refresh(): Promise<AbsUser> {
  const res = await check(await transport().refresh());
  const { user } = (await res.json()) as RefreshResponse;
  adopt(user);
  return user;
}

/**
 * The session at launch: null when there is none (ABS said 401), else the user. Offline, or with ABS down, it is the
 * user last signed in here, without a token, and the app runs offline until the server answers again (see
 * connectivity.ts, whose checks renew the session). With no such user it throws, and the app says it needs a connection.
 */
export async function restoreSession(): Promise<AbsUser | null> {
  const pending = refreshOnce();
  const last = rememberedUser();
  // On a connection that hangs rather than fails (signal but no data, Wi-Fi with no internet) the renewal can take a
  // minute to give up, with the app blank meanwhile. With a user to fall back on, the app opens offline after a short
  // wait and leaves the renewal running: it is never cancelled, as ABS replaces the refresh token when it answers, and
  // a renewal cut off after the server handled it would lose the new one. Its answer still counts when it comes:
  // refreshOnce hands a new user to onSessionRenewed, a 401 signs out, and connectivity's retries share it.
  if (last && !(await settlesWithin(pending, LAUNCH_WAIT_MS))) {
    markUnreachable();
    pending.catch(() => undefined);
    return { ...last, accessToken: '' };
  }
  try {
    return await pending;
  } catch (e) {
    // refreshOnce has already signed out and forgotten the user.
    if (e instanceof AbsError && e.status === 401) return null;
    if (!isNetworkError(e)) throw e;
    markUnreachable();
    const last = rememberedUser();
    if (!last) throw e;
    return { ...last, accessToken: '' };
  }
}

/** How long launch waits on the session renewal before opening offline as the user last signed in here. */
export const LAUNCH_WAIT_MS = 3000;

/** True when `p` settles (either way) within `ms`. */
function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    p.then(done, done);
  });
}

export async function logout(): Promise<void> {
  try {
    await transport().logout();
  } catch {
    // Offline or server down: still sign out locally.
  } finally {
    signedOut();
  }
}

// Single-flight: concurrent 401s share one refresh and one sign-out.
function refreshOnce(): Promise<AbsUser> {
  refreshing ??= refresh()
    .then((user) => {
      renewedListeners.forEach((cb) => cb(user));
      return user;
    })
    .catch((e: unknown) => {
      if (e instanceof AbsError && e.status === 401) {
        signedOut();
        throw new AbsError(401, 'Session expired');
      }
      if (isNetworkError(e)) markUnreachable();
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Renews the session quietly: how the app asks whether the server is back. A 401 signs out as any expired session
 * does; a network failure rejects and leaves the session as it was.
 */
export const renewSession = (): Promise<AbsUser> => refreshOnce();

/**
 * An ABS request with the app's auth, for a caller that reads the body itself (a file download). A 401 renews the
 * session and tries once more. Resolves with the response whatever its status; a network failure rejects.
 */
export async function absResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(absUrl(path), { ...init, headers });
  };
  try {
    let res = await send();
    if (res.status === 401) {
      await res.body?.cancel().catch(() => undefined);
      await refreshOnce();
      res = await send();
    }
    markReachable();
    return res;
  } catch (e) {
    if (isNetworkError(e)) markUnreachable();
    throw e;
  }
}

export async function absFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(absUrl(path), { ...init, headers });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401) {
      await refreshOnce();
      res = await send();
    }
    await check(res);
  } catch (e) {
    if (isNetworkError(e)) markUnreachable();
    throw e;
  }
  markReachable();
  const text = await res.text();
  // ABS answers some writes (sync, close) with the text "OK"; treat non-JSON or empty as no value.
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

export function onSignedOut(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/**
 * Calls back whenever the signed-in user's data on this device must go: on signing out, and when ABS no longer accepts
 * the session (at launch or later). Before `onSignedOut`'s callbacks. Returns the unsubscribe.
 */
export function onForgetUser(cb: () => void): () => void {
  forgetListeners.add(cb);
  return () => void forgetListeners.delete(cb);
}

/** Calls back with the user each time the session is renewed after launch (a 401's refresh, or coming back online). */
export function onSessionRenewed(cb: (user: AbsUser) => void): () => void {
  renewedListeners.add(cb);
  return () => void renewedListeners.delete(cb);
}

export function resetAuthForTests(): void {
  accessToken = null;
  refreshing = null;
  listeners.clear();
  forgetListeners.clear();
  renewedListeners.clear();
}
