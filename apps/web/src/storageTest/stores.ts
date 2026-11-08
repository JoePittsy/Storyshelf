// Where the storage test keeps its copies, and its notes about them. Nothing here touches the app's own storage:
// one cache, one OPFS folder and two localStorage keys, all named for the test.
import type { Backend } from './env';

export const CACHE_NAME = 'storyshelf-storage-test';
export const OPFS_DIR = 'storyshelf-storage-test';
export const SUBDIR: Record<Exclude<Backend, 'cache'>, string> = { 'opfs-writable': 'writable', 'opfs-sync': 'sync' };
export const META_KEY = 'storyshelf.storageTest.items';
/** Set while a download runs; still there on the next load means it never finished (app killed, reloaded). */
export const RUNNING_KEY = 'storyshelf.storageTest.running';

/** What the test remembers about a copy, beside the copy itself. */
export interface StoredMeta {
  backend: Backend;
  name: string;
  itemId: string;
  ino: string;
  title: string;
  updatedAt: number;
  mimeType: string;
  filename: string;
  /** Full size per ABS (tracks[].metadata.size). */
  expected: number | null;
  /** Bytes known written. */
  bytes: number;
  complete: boolean;
  /** ms since the epoch. */
  startedAt: number;
  storedAt: number | null;
}

export interface Running {
  key: string;
  bytes: number;
  /** ms since the epoch, of the last update. */
  at: number;
}

export const metaKey = (backend: Backend, name: string) => `${backend}:${name}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked.
  }
}

export const readMeta = (): Record<string, StoredMeta> => readJson(META_KEY, {});
export function putMeta(m: StoredMeta): void {
  writeJson(META_KEY, { ...readMeta(), [metaKey(m.backend, m.name)]: m });
}
export function dropMeta(key: string): void {
  const all = readMeta();
  delete all[key];
  writeJson(META_KEY, all);
}
export const readRunning = (): Running | null => readJson<Running | null>(RUNNING_KEY, null);
export const writeRunning = (r: Running | null): void => writeJson(RUNNING_KEY, r);

/** A cache key: a same-origin URL no request will ever ask for. */
export const cacheRequest = (name: string): string =>
  new URL(`/__storyshelf-storage-test/${encodeURIComponent(name)}`, location.origin).href;

export async function opfsDir(backend: Exclude<Backend, 'cache'>, create = true): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const top = await root.getDirectoryHandle(OPFS_DIR, { create });
  return top.getDirectoryHandle(SUBDIR[backend], { create });
}

/** Bytes already in an OPFS copy; 0 when there's none. */
export async function opfsSize(backend: Exclude<Backend, 'cache'>, name: string): Promise<number> {
  try {
    const dir = await opfsDir(backend, false);
    const fh = await dir.getFileHandle(name);
    return (await fh.getFile()).size;
  } catch (e) {
    if ((e as { name?: string }).name === 'NotFoundError') return 0;
    throw e;
  }
}

export interface Row {
  key: string;
  backend: Backend;
  name: string;
  /** Found in storage now. */
  present: boolean;
  /** Bytes found in storage; null when it can't be told cheaply. */
  size: number | null;
  lastModified: number | null;
  meta: StoredMeta | null;
}

/** Everything the test has stored, found by looking (not only by the notes). Failures are passed to `onError`. */
export async function listStored(onError: (where: string, e: unknown) => void): Promise<Row[]> {
  const meta = readMeta();
  const rows = new Map<string, Row>();
  if (typeof caches !== 'undefined') {
    try {
      if (await caches.has(CACHE_NAME)) {
        const cache = await caches.open(CACHE_NAME);
        for (const req of await cache.keys()) {
          const name = decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? '');
          const res = await cache.match(req);
          const len = Number(res?.headers.get('x-test-bytes') ?? res?.headers.get('content-length'));
          const key = metaKey('cache', name);
          rows.set(key, {
            key,
            backend: 'cache',
            name,
            present: true,
            size: Number.isFinite(len) && len > 0 ? len : null,
            lastModified: null,
            meta: meta[key] ?? null,
          });
        }
      }
    } catch (e) {
      onError('Cache Storage list', e);
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') {
    for (const backend of ['opfs-writable', 'opfs-sync'] as const) {
      try {
        const dir = await opfsDir(backend, false);
        const entries = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
        for await (const h of entries) {
          if (h.kind !== 'file') continue;
          const key = metaKey(backend, h.name);
          let size: number | null = null;
          let lastModified: number | null = null;
          try {
            const f = await (h as FileSystemFileHandle).getFile();
            size = f.size;
            lastModified = f.lastModified;
          } catch (e) {
            onError(`OPFS getFile ${h.name}`, e);
          }
          rows.set(key, { key, backend, name: h.name, present: true, size, lastModified, meta: meta[key] ?? null });
        }
      } catch (e) {
        if ((e as { name?: string }).name !== 'NotFoundError') onError(`OPFS list (${backend})`, e);
      }
    }
  }
  // Noted but not found: evicted, or never got as far as storage.
  for (const [key, m] of Object.entries(meta)) {
    if (!rows.has(key))
      rows.set(key, { key, backend: m.backend, name: m.name, present: false, size: null, lastModified: null, meta: m });
  }
  return [...rows.values()];
}

export async function deleteStored(row: Pick<Row, 'key' | 'backend' | 'name'>): Promise<void> {
  try {
    if (row.backend === 'cache') {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(cacheRequest(row.name));
    } else {
      const dir = await opfsDir(row.backend, false);
      await dir.removeEntry(row.name);
    }
  } catch (e) {
    if ((e as { name?: string }).name !== 'NotFoundError') throw e;
  } finally {
    dropMeta(row.key);
  }
}

/** Removes the test's cache, OPFS folder and notes. Each part is tried even if another fails; the failures are returned. */
export async function deleteAll(): Promise<string[]> {
  const failures: string[] = [];
  const fmt = (e: unknown) => `${(e as Error)?.name}: ${(e as Error)?.message}`;
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
    } catch (e) {
      failures.push(`Cache Storage: ${fmt(e)}`);
    }
  }
  if (typeof navigator.storage?.getDirectory === 'function') {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(OPFS_DIR, { recursive: true });
    } catch (e) {
      if ((e as { name?: string }).name !== 'NotFoundError') failures.push(`OPFS: ${fmt(e)}`);
    }
  }
  writeJson(META_KEY, null);
  writeJson(RUNNING_KEY, null);
  return failures;
}

/** The stored bytes as a Blob/File, without copying them into memory. */
export async function storedBlob(row: Pick<Row, 'backend' | 'name'>): Promise<Blob> {
  if (row.backend === 'cache') {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(cacheRequest(row.name));
    if (!res) throw new Error('Not in the cache');
    return res.blob();
  }
  const dir = await opfsDir(row.backend, false);
  return (await dir.getFileHandle(row.name)).getFile();
}
