/**
 * Hosted-mode auth: apps/web/src/api/auth.ts through the hosted transport (transport.ts).
 * Cookie-free: tokens travel in headers, the refresh token is kept in localStorage and rotates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbsError, absFetch, login, logout, onSignedOut, resetAuthForTests, restoreSession } from './auth';
import { resetServerForTests, setMode, setServerUrl } from './server';

const SERVER = 'https://abs.example.com';
const KEY = 'storyshelf.refreshToken';

interface Rec {
  url: string;
  method: string;
  init: RequestInit;
}
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const userBody = (access: string, refresh: string) => ({
  user: { id: 'u1', username: 'joe', accessToken: access, refreshToken: refresh },
});

let store: Map<string, string>;
let calls: Rec[];
let n: number;
/** Tokens ABS currently accepts for refresh. */
let validRefresh: Set<string>;
let validAccess = '';
let gate: Promise<void> | null = null;

function issue(): { access: string; refresh: string } {
  n += 1;
  validAccess = `access-${n}`;
  const refresh = `refresh-${n}`;
  validRefresh = new Set([refresh]); // rotation: the old one stops working
  return { access: validAccess, refresh };
}

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  calls = [];
  n = 0;
  validRefresh = new Set();
  validAccess = '';
  gate = null;
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const rec = { url: input, method: (init.method ?? 'GET').toUpperCase(), init };
    calls.push(rec);
    await Promise.resolve();
    if (rec.url === `${SERVER}/login`) {
      const b = JSON.parse(String(init.body)) as { password: string };
      if (b.password !== 'correct') return new Response('Unauthorized', { status: 401 });
      const t = issue();
      return jsonRes(userBody(t.access, header(init, 'x-return-tokens') ? t.refresh : ''));
    }
    if (rec.url === `${SERVER}/auth/refresh`) {
      if (gate) await gate;
      const sent = header(init, 'x-refresh-token');
      if (!sent || !validRefresh.has(sent)) return new Response('Unauthorized', { status: 401 });
      const t = issue();
      return jsonRes(userBody(t.access, t.refresh));
    }
    if (rec.url === `${SERVER}/logout`) return jsonRes({});
    return header(init, 'authorization') === `Bearer ${validAccess}`
      ? jsonRes({ ok: true })
      : new Response('x', { status: 401 });
  });
  setMode('hosted');
  setServerUrl(SERVER);
});
afterEach(() => {
  resetAuthForTests();
  resetServerForTests();
  vi.unstubAllGlobals();
});

const to = (path: string) => calls.filter((c) => c.url === `${SERVER}${path}`);

describe('hosted login', () => {
  it('POSTs to the server with x-return-tokens and without credentials', async () => {
    await login('joe', 'correct');
    const req = to('/login')[0];
    expect(req?.method).toBe('POST');
    expect(header(req?.init ?? {}, 'x-return-tokens')).toBe('true');
    expect(req?.init.credentials, 'hosted requests must be cookie-free').toBeUndefined();
    expect(JSON.parse(String(req?.init.body))).toEqual({ username: 'joe', password: 'correct' });
  });

  it('stores the refresh token under storyshelf.refreshToken and keeps the access token off storage', async () => {
    const user = await login('joe', 'correct');
    expect(store.get(KEY)).toBe('refresh-1');
    expect([...store.values()]).not.toContain(user.accessToken);
  });

  it('stores nothing when the login fails', async () => {
    await expect(login('joe', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(store.has(KEY)).toBe(false);
  });
});

describe('hosted refresh', () => {
  it('restoreSession sends the stored token in x-refresh-token, no credentials, and stores the rotated token', async () => {
    store.set(KEY, 'refresh-0');
    validRefresh = new Set(['refresh-0']);
    const user = await restoreSession();
    expect(user?.username).toBe('joe');
    const req = to('/auth/refresh')[0];
    expect(header(req?.init ?? {}, 'x-refresh-token')).toBe('refresh-0');
    expect(req?.init.credentials).toBeUndefined();
    expect(store.get(KEY)).toBe('refresh-1');
  });

  it('restoreSession is null without any request when nothing is stored', async () => {
    await expect(restoreSession()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('restoreSession is null and clears a rejected token', async () => {
    store.set(KEY, 'stale');
    await expect(restoreSession()).resolves.toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('keeps the token when the server is unreachable', async () => {
    store.set(KEY, 'refresh-0');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(restoreSession()).rejects.toBeInstanceOf(TypeError);
    expect(store.get(KEY)).toBe('refresh-0');
  });

  it('rotates on every refresh: the second refresh uses the token the first returned', async () => {
    await login('joe', 'correct'); // refresh-1
    validAccess = 'expired';
    await absFetch('/api/x'); // 401 -> refresh with refresh-1 -> refresh-2
    validAccess = 'expired';
    await absFetch('/api/x'); // -> refresh with refresh-2 -> refresh-3
    const sent = to('/auth/refresh').map((c) => header(c.init, 'x-refresh-token'));
    expect(sent).toEqual(['refresh-1', 'refresh-2']);
    expect(store.get(KEY)).toBe('refresh-3');
  });

  it('single-flights concurrent 401s into one refresh', async () => {
    await login('joe', 'correct');
    validAccess = 'expired';
    let release: () => void = () => undefined;
    gate = new Promise<void>((r) => (release = r));
    const all = Promise.all([absFetch('/api/a'), absFetch('/api/b'), absFetch('/api/c')]);
    await vi.waitFor(() => expect(to('/auth/refresh').length).toBe(1));
    release();
    await all;
    expect(to('/auth/refresh')).toHaveLength(1);
  });

  it('signs out and clears the token when the refresh is rejected', async () => {
    await login('joe', 'correct');
    validAccess = 'expired';
    validRefresh = new Set();
    const spy = vi.fn();
    onSignedOut(spy);
    await expect(absFetch('/api/x')).rejects.toBeInstanceOf(AbsError);
    expect(spy).toHaveBeenCalledOnce();
    expect(store.has(KEY)).toBe(false);
  });
});

describe('hosted requests', () => {
  it('prefix paths with the server and send the Bearer token', async () => {
    await login('joe', 'correct');
    await absFetch('/api/me');
    const req = to('/api/me')[0];
    expect(req).toBeDefined();
    expect(header(req?.init ?? {}, 'authorization')).toBe('Bearer access-1');
    expect(req?.init.credentials).toBeUndefined();
  });
});

describe('hosted logout', () => {
  it('sends x-refresh-token without credentials, clears storage and notifies listeners', async () => {
    await login('joe', 'correct');
    const spy = vi.fn();
    onSignedOut(spy);
    await logout();
    const req = to('/logout')[0];
    expect(req?.method).toBe('POST');
    expect(header(req?.init ?? {}, 'x-refresh-token')).toBe('refresh-1');
    expect(req?.init.credentials).toBeUndefined();
    expect(store.has(KEY)).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('still clears storage when the server is unreachable', async () => {
    await login('joe', 'correct');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await logout();
    expect(store.has(KEY)).toBe(false);
  });
});
