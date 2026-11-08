// The storage test's own log (/debug/storage): timestamped lines, written through to localStorage on every entry so they
// survive a reload or the app being killed mid-download. Separate from the player's diag log.
import { useSyncExternalStore } from 'react';

export interface LogEntry {
  /** ISO time. */
  t: string;
  msg: string;
}

export const LOG_KEY = 'storyshelf.storageTest.log';
export const LOG_MAX = 1000;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Deps {
  storage?: () => Store;
  iso?: () => string;
  max?: number;
}

export interface StorageLog {
  log(msg: string, detail?: unknown): void;
  /** Oldest first. A new array whenever the content changes. */
  entries(): LogEntry[];
  clear(): void;
  subscribe(cb: () => void): () => void;
}

export function loadLog(storage: Store, max = LOG_MAX): LogEntry[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(LOG_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is LogEntry => !!e && typeof e.t === 'string' && typeof e.msg === 'string').slice(-max);
  } catch {
    return [];
  }
}

/** One line of detail: strings as they are, errors as "Name: message", anything else as JSON. */
export function describe(detail: unknown): string {
  if (detail === undefined) return '';
  if (typeof detail === 'string') return detail;
  if (detail instanceof Error || (detail && typeof detail === 'object' && 'name' in detail && 'message' in detail)) {
    const e = detail as { name: unknown; message: unknown };
    return `${String(e.name)}: ${String(e.message)}`;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function createStorageLog(deps: Deps = {}): StorageLog {
  const storage = deps.storage ?? (() => localStorage);
  const iso = deps.iso ?? (() => new Date().toISOString());
  const max = deps.max ?? LOG_MAX;
  let list: LogEntry[] = (() => {
    try {
      return loadLog(storage(), max);
    } catch {
      return [];
    }
  })();
  const listeners = new Set<() => void>();
  const save = () => {
    try {
      storage().setItem(LOG_KEY, JSON.stringify(list));
    } catch {
      // Storage full or blocked: the log lasts for this page only.
    }
  };
  return {
    log(msg, detail) {
      const d = describe(detail);
      list = [...list, { t: iso(), msg: d ? `${msg} ${d}` : msg }].slice(-max);
      save();
      listeners.forEach((cb) => cb());
    },
    entries: () => list,
    clear() {
      list = [];
      try {
        storage().removeItem(LOG_KEY);
      } catch {
        // Nothing to clear.
      }
      listeners.forEach((cb) => cb());
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}

export const storageLog = createStorageLog();

export const useStorageLog = (): LogEntry[] => useSyncExternalStore(storageLog.subscribe, storageLog.entries);

/** The log as plain text, oldest first (it reads as a story), one line per entry. */
export const formatLog = (list: LogEntry[]): string => list.map((e) => `${e.t} ${e.msg}`).join('\n');

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** MB/s (MiB) for `bytes` over `ms`; "?" before any time has passed. */
export function formatRate(bytes: number, ms: number): string {
  if (!(ms > 0)) return '?';
  return `${(bytes / 1024 / 1024 / (ms / 1000)).toFixed(2)} MB/s`;
}
