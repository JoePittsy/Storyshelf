/**
 * How auth requests reach ABS. The only place that differs between the two modes.
 *
 * Same-origin: ABS's httpOnly refresh cookie does the work, so requests carry credentials.
 * Hosted: cross-origin credentialed requests are blocked by ABS's CORS answer, so the refresh token
 * travels in headers and bodies instead and is kept in localStorage.
 */
import { absUrl, getMode } from './server';
import type { AbsUser } from './types';

export interface Transport {
  login(username: string, password: string): Promise<Response>;
  refresh(): Promise<Response>;
  logout(): Promise<void>;
  /** Called with every user ABS returns from login or refresh. */
  adopt(user: AbsUser): void;
  /** Called when the session ends locally. */
  clear(): void;
}

const json = { 'content-type': 'application/json' };
const credentials = (username: string, password: string) => JSON.stringify({ username, password });

const sameOrigin: Transport = {
  login: (username, password) =>
    fetch(absUrl('/login'), {
      method: 'POST',
      credentials: 'include',
      headers: json,
      body: credentials(username, password),
    }),
  refresh: () => fetch(absUrl('/auth/refresh'), { method: 'POST', credentials: 'include' }),
  logout: async () => {
    await fetch(absUrl('/logout'), { method: 'POST', credentials: 'include' });
  },
  adopt: () => undefined,
  clear: () => undefined,
};

export const REFRESH_TOKEN_KEY = 'storyshelf.refreshToken';

const stored = (): string | null => {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
};
const store = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Storage blocked: the session lasts until the page closes.
  }
};

const hosted: Transport = {
  login: (username, password) =>
    fetch(absUrl('/login'), {
      method: 'POST',
      headers: { ...json, 'x-return-tokens': 'true' },
      body: credentials(username, password),
    }),
  refresh: async () => {
    const token = stored();
    if (!token) return new Response('No session', { status: 401 });
    return fetch(absUrl('/auth/refresh'), { method: 'POST', headers: { 'x-refresh-token': token } });
  },
  logout: async () => {
    const token = stored();
    if (!token) return;
    await fetch(absUrl('/logout'), { method: 'POST', headers: { 'x-refresh-token': token } });
  },
  // Refresh tokens rotate: always keep the newest.
  adopt: (user) => {
    if (user.refreshToken) store(user.refreshToken);
  },
  clear: () => store(null),
};

export const transport = (): Transport => (getMode() === 'hosted' ? hosted : sameOrigin);
