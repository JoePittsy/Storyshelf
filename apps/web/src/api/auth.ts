import type { AbsUser, LoginResponse, RefreshResponse, ServerStatus } from './types';

export type { AbsUser, ServerStatus };

export class AbsError extends Error {
  constructor(
    public status: number,
    message: string,
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

// Access token lives in memory only; the refresh token stays in ABS's httpOnly cookie.
let accessToken: string | null = null;
let refreshing: Promise<AbsUser> | null = null;
const listeners = new Set<() => void>();

async function check(res: Response): Promise<Response> {
  if (!res.ok) throw new AbsError(res.status, (await res.text().catch(() => '')) || res.statusText);
  return res;
}

function signedOut(): void {
  accessToken = null;
  listeners.forEach((cb) => cb());
}

export async function getStatus(): Promise<ServerStatus> {
  return (await check(await fetch('/status'))).json() as Promise<ServerStatus>;
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

export async function login(username: string, password: string): Promise<AbsUser> {
  const res = await check(
    await fetch('/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  const { user } = (await res.json()) as LoginResponse;
  accessToken = user.accessToken;
  return user;
}

async function refresh(): Promise<AbsUser> {
  const res = await check(await fetch('/auth/refresh', { method: 'POST', credentials: 'include' }));
  const { user } = (await res.json()) as RefreshResponse;
  accessToken = user.accessToken;
  return user;
}

export async function restoreSession(): Promise<AbsUser | null> {
  try {
    return await refresh();
  } catch (e) {
    if (e instanceof AbsError && e.status === 401) return null;
    throw e;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Offline or server down: still sign out locally.
  } finally {
    signedOut();
  }
}

// Single-flight: concurrent 401s share one refresh and one sign-out.
function refreshOnce(): Promise<AbsUser> {
  refreshing ??= refresh()
    .catch((e: unknown) => {
      if (e instanceof AbsError && e.status === 401) {
        signedOut();
        throw new AbsError(401, 'Session expired');
      }
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function absFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(path, { ...init, headers });
  };
  let res = await send();
  if (res.status === 401) {
    await refreshOnce();
    res = await send();
  }
  return (await check(res)).json() as Promise<T>;
}

export function onSignedOut(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function resetAuthForTests(): void {
  accessToken = null;
  refreshing = null;
  listeners.clear();
}
