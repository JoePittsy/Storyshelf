/**
 * The query client, and the copy of its cache kept on the device so that offline the library, Continue listening, the
 * last book and History show as they were last seen.
 *
 * The copy lives in IndexedDB (structured clone, so the Maps some queries hold survive). It belongs to one user on one
 * server: written under that owner, and restored only for the same one, so one account never sees another's books. It
 * is dropped by a new release (the buster), after a week, and when the user's data must go (see `onForgetUser`).
 */
import { QueryClient, onlineManager, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions, PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { createStore, del, get, set } from 'idb-keyval';
import { isNetworkError, isOffline, subscribeConnectivity } from './connectivity';
import { rememberedUser, serverKey } from './lastUser';

/** How long a kept copy stays usable, and so how long a query stays in memory unused. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Queries never written to the device. The session holds the access token, and the server checks are only worth having
 * fresh. Everything else the app asks ABS for is the listener's library and listening, with no token in it.
 */
const NOT_KEPT = new Set(['session', 'server-support', 'status']);

export const shouldKeepQuery = (q: Pick<Query, 'queryKey' | 'state'>): boolean =>
  q.state.status === 'success' && !NOT_KEPT.has(String(q.queryKey[0]));

/** Whose cache this is: the remembered user on this server, or null when nobody is signed in (nothing is kept). */
export function cacheOwner(): string | null {
  const user = rememberedUser();
  return user ? `${serverKey()}|${user.id}` : null;
}

export interface Kept {
  owner: string;
  client: PersistedClient;
}

/** Where the copy is kept. IndexedDB in the app; a stand-in in tests. */
export interface KeptStore {
  get(): Promise<Kept | undefined>;
  set(value: Kept): Promise<void>;
  del(): Promise<void>;
}

let idb: ReturnType<typeof createStore> | undefined;
const db = () => (idb ??= createStore('storyshelf-cache', 'cache'));
const KEY = 'queries';
/** The IndexedDB store, opened on first use. Async throughout, so a browser without IndexedDB just rejects. */
export const idbStore: KeptStore = {
  get: async () => get<Kept>(KEY, db()),
  set: async (value) => set(KEY, value, db()),
  del: async () => del(KEY, db()),
};

export interface CachePersister extends Persister {
  /** Writes a pending change now: for when the app leaves the screen, since iOS may then end it without a word. */
  flush(): Promise<void>;
}

/**
 * A persister that writes at most once per `throttleMs`, only while someone is signed in, and restores only the copy
 * written for the current owner (any other is deleted). Storage failures are swallowed: the copy is a convenience.
 */
export function createCachePersister(
  store: KeptStore,
  owner: () => string | null = cacheOwner,
  throttleMs = 1000
): CachePersister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    const client = pending;
    const who = owner();
    pending = null;
    if (!client || !who) return;
    await store.set({ owner: who, client }).catch(() => undefined);
  };
  return {
    flush,
    persistClient: (client) => {
      pending = client;
      timer ??= setTimeout(() => void flush(), throttleMs);
    },
    restoreClient: async () => {
      const kept = await store.get().catch(() => undefined);
      if (!kept) return undefined;
      const who = owner();
      if (who && kept.owner === who) return kept.client;
      await store.del().catch(() => undefined);
      return undefined;
    },
    removeClient: async () => {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
      await store.del().catch(() => undefined);
    },
  };
}

/** The options PersistQueryClientProvider takes. A new release starts with an empty cache. */
export const persistOptions = (persister: Persister): Omit<PersistQueryClientOptions, 'queryClient'> => ({
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: __APP_VERSION__,
  dehydrateOptions: { shouldDehydrateQuery: shouldKeepQuery },
});

/**
 * Three tries, as TanStack's default, except while offline: then a query keeps its turn, and its next try waits for the
 * connection (see `followConnectivity`), so a page offline keeps what it has rather than turning into an error.
 */
const retry = (count: number, error: unknown) => count < 3 || (isNetworkError(error) && isOffline());
/** For the queries that never wait: a network failure is the answer, at once. */
const retryUnlessUnreachable = (count: number, error: unknown) => !isNetworkError(error) && count < 3;

/**
 * The app's query client. Queries follow connectivity.ts rather than the browser's online flag: offline, they keep what
 * they have and wait, and they fetch again once the server answers. The session never waits, so the app can open
 * offline, and the sign-in screen's checks say at once that the server can't be reached.
 */
export function createQueryClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: CACHE_MAX_AGE, retry } } });
  qc.setQueryDefaults(['session'], { networkMode: 'always', retry: retryUnlessUnreachable, staleTime: Infinity });
  qc.setQueryDefaults(['server-support'], { networkMode: 'always', retry: retryUnlessUnreachable });
  return qc;
}

/** Points TanStack Query's idea of online at connectivity.ts. Once, at start. */
export function followConnectivity(): void {
  onlineManager.setEventListener((setOnline) => {
    setOnline(!isOffline());
    return subscribeConnectivity(() => setOnline(!isOffline()));
  });
}

/** Drops every query but the session from memory: before a new session begins, so it starts with nothing of the last. */
export function clearUserQueries(qc: QueryClient): void {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
}
