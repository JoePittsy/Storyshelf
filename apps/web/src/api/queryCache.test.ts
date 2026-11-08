/**
 * The query cache kept on the device: apps/web/src/api/queryCache.ts
 * What is kept (never the session or anything with a token), whose it is (one user on one server), when it is dropped
 * (a new release, a week, signing out), and how queries behave offline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
} from '@tanstack/react-query-persist-client';
import {
  CACHE_MAX_AGE,
  cacheOwner,
  clearUserQueries,
  createCachePersister,
  createQueryClient,
  followConnectivity,
  persistOptions,
  shouldKeepQuery,
  type Kept,
  type KeptStore,
} from './queryCache';
import { markReachable, markUnreachable, resetConnectivityForTests } from './connectivity';
import { rememberUser } from './lastUser';
import { resetServerForTests, setMode, setServerUrl } from './server';
import type { AbsUser } from './types';

function memoryStore(): KeptStore & { value: Kept | undefined } {
  const s = {
    value: undefined as Kept | undefined,
    get: () => Promise.resolve(s.value),
    set: (v: Kept) => {
      s.value = v;
      return Promise.resolve();
    },
    del: () => {
      s.value = undefined;
      return Promise.resolve();
    },
  };
  return s;
}

const user = (id: string): AbsUser => ({ id, username: id, accessToken: 'SECRET-ACCESS', refreshToken: 'SECRET-R' });
const client = (n: number): PersistedClient => ({
  timestamp: n,
  buster: '',
  clientState: { queries: [], mutations: [] },
});

beforeEach(() => {
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetServerForTests();
  resetConnectivityForTests();
});

describe('what is kept', () => {
  const q = (key: unknown[], status: 'success' | 'error' | 'pending' = 'success') => ({
    queryKey: key,
    state: { status } as never,
  });

  it('keeps the library and listening queries', () => {
    for (const key of [['libraries'], ['items', 'lib1', 'title', '', false], ['me'], ['items-in-progress']])
      expect(shouldKeepQuery(q(key))).toBe(true);
  });

  it('never keeps the session (it holds the access token) or the server checks', () => {
    for (const key of [['session'], ['server-support', null], ['status']]) expect(shouldKeepQuery(q(key))).toBe(false);
  });

  it('keeps only answers, not errors or queries still loading', () => {
    expect(shouldKeepQuery(q(['libraries'], 'error'))).toBe(false);
    expect(shouldKeepQuery(q(['libraries'], 'pending'))).toBe(false);
  });

  it('a saved cache has the library but no session and no token', async () => {
    rememberUser(user('u1'));
    const store = memoryStore();
    const persister = createCachePersister(store, cacheOwner, 0);
    const qc = new QueryClient();
    qc.setQueryData(['session'], user('u1'));
    qc.setQueryData(['libraries'], [{ id: 'lib1', name: 'Books' }]);
    qc.setQueryData(['me'], new Map([['li_1', { currentTime: 10 }]]));
    await persistQueryClientSave({ queryClient: qc, ...persistOptions(persister) });
    await persister.flush();
    const keys = store.value?.client.clientState.queries.map((x) => x.queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(['libraries', 'me']));
    expect(keys).not.toContain('session');
    // Kept by structured clone, so a Map stays a Map.
    expect(store.value?.client.clientState.queries.find((x) => x.queryKey[0] === 'me')?.state.data).toBeInstanceOf(Map);
    expect(JSON.stringify(store.value?.client.clientState.queries.map((x) => x.state.data))).not.toContain('SECRET');
  });
});

describe('whose it is', () => {
  it('is the remembered user on this server, or nobody', () => {
    expect(cacheOwner()).toBeNull();
    rememberUser(user('u1'));
    expect(cacheOwner()).toBe('same-origin|u1');
    setMode('hosted');
    setServerUrl('https://abs.example.com');
    rememberUser(user('u1'));
    expect(cacheOwner()).toBe('hosted:https://abs.example.com|u1');
  });

  it('writes nothing while nobody is signed in', async () => {
    const store = memoryStore();
    const persister = createCachePersister(store, () => null, 0);
    await persister.persistClient(client(1));
    await persister.flush();
    expect(store.value).toBeUndefined();
  });

  it("restores only the owner's own copy, and deletes anyone else's", async () => {
    const store = memoryStore();
    let owner = 'same-origin|u1';
    const persister = createCachePersister(store, () => owner, 0);
    await persister.persistClient(client(1));
    await persister.flush();
    expect(await persister.restoreClient()).toEqual(client(1));
    owner = 'same-origin|u2';
    expect(await persister.restoreClient()).toBeUndefined();
    expect(store.value).toBeUndefined();
  });

  it('restores nothing when nobody is signed in', async () => {
    const store = memoryStore();
    store.value = { owner: 'same-origin|u1', client: client(1) };
    expect(await createCachePersister(store, () => null).restoreClient()).toBeUndefined();
  });
});

describe('when it is dropped', () => {
  it('a new release and a week are the limits', () => {
    const opts = persistOptions(createCachePersister(memoryStore()));
    expect(opts.buster).toBe(__APP_VERSION__);
    expect(opts.maxAge).toBe(CACHE_MAX_AGE);
    expect(CACHE_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("a copy from another release isn't restored", async () => {
    rememberUser(user('u1'));
    const store = memoryStore();
    store.value = { owner: 'same-origin|u1', client: { ...client(Date.now()), buster: '0.0.1' } };
    const qc = new QueryClient();
    await persistQueryClientRestore({ queryClient: qc, ...persistOptions(createCachePersister(store)) });
    expect(store.value).toBeUndefined();
  });

  it('removeClient deletes the copy and drops a pending write', async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    store.value = { owner: 'o', client: client(1) };
    const persister = createCachePersister(store, () => 'o', 1000);
    await persister.persistClient(client(2));
    await persister.removeClient();
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.value).toBeUndefined();
  });

  it('writes at most once a second, the latest state', async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const set = vi.spyOn(store, 'set');
    const persister = createCachePersister(store, () => 'o', 1000);
    await persister.persistClient(client(1));
    await persister.persistClient(client(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(set).toHaveBeenCalledTimes(1);
    expect(store.value?.client).toEqual(client(2));
  });

  it('clearUserQueries leaves only the session in memory', () => {
    const qc = new QueryClient();
    qc.setQueryData(['session'], user('u1'));
    qc.setQueryData(['libraries'], []);
    clearUserQueries(qc);
    expect(
      qc
        .getQueryCache()
        .getAll()
        .map((x) => x.queryKey[0])
    ).toEqual(['session']);
  });
});

describe('queries offline', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('a query with something kept keeps it and waits, rather than failing, then fetches once back online', async () => {
    followConnectivity();
    const qc = createQueryClient();
    qc.mount(); // as QueryClientProvider does: it then hears the connection come back
    qc.setQueryData(['libraries'], ['kept']);
    markUnreachable();
    const fn = vi.fn(() => Promise.resolve(['fresh']));
    const unsubscribe = new QueryObserver(qc, { queryKey: ['libraries'], queryFn: fn }).subscribe(() => undefined);
    const query = qc.getQueryCache().find({ queryKey: ['libraries'] });
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
    expect(query?.state).toMatchObject({ status: 'success', data: ['kept'], fetchStatus: 'paused' });
    markReachable();
    await vi.waitFor(() => expect(query?.state.data).toEqual(['fresh']));
    unsubscribe();
    qc.unmount();
  });

  it('the session never waits, so the app can open offline', async () => {
    followConnectivity();
    const qc = createQueryClient();
    markUnreachable();
    await expect(qc.fetchQuery({ queryKey: ['session'], queryFn: () => Promise.resolve(null) })).resolves.toBeNull();
  });
});
