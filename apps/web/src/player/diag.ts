// On-device diagnostics: a ring buffer of recent player events, persisted so it survives a page suspend or reload.
// Read it at /debug. Built for a phone with no remote inspector.
import { useSyncExternalStore } from 'react';

export interface DiagEntry {
  t: string;
  ev: string;
  detail?: unknown;
}

export const DIAG_MAX = 300;
export const DIAG_KEY = 'storyshelf.diag';
const WRITE_GAP_MS = 1000;

export interface DiagStore {
  log(ev: string, detail?: unknown): void;
  /** Oldest first. A new array whenever the content changes. */
  entries(): DiagEntry[];
  clear(): void;
  /** Write to storage now, if anything is unsaved. */
  flush(): void;
  subscribe(cb: () => void): () => void;
}

interface Deps {
  storage?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  now?: () => number;
  iso?: () => string;
  max?: number;
}

function load(storage: NonNullable<Deps['storage']>, max: number): DiagEntry[] {
  try {
    const raw: unknown = JSON.parse(storage().getItem(DIAG_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is DiagEntry => !!e && typeof e.t === 'string' && typeof e.ev === 'string')
      .slice(-max);
  } catch {
    return [];
  }
}

export function createDiag(deps: Deps = {}): DiagStore {
  const storage = deps.storage ?? (() => localStorage);
  const now = deps.now ?? (() => Date.now());
  const iso = deps.iso ?? (() => new Date().toISOString());
  const max = deps.max ?? DIAG_MAX;
  let list = load(storage, max);
  let dirty = false;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((cb) => cb());

  function flush(): void {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    lastWrite = now();
    try {
      storage().setItem(DIAG_KEY, JSON.stringify(list));
    } catch {
      // Storage full or blocked: the log lasts for this page only.
    }
  }

  function schedule(): void {
    dirty = true;
    const wait = lastWrite + WRITE_GAP_MS - now();
    if (wait <= 0) return flush();
    // A backup only: the page-hide handlers flush too, which is what matters on a phone.
    timer ??= setTimeout(flush, wait);
  }

  return {
    log(ev, detail) {
      const e: DiagEntry = detail === undefined ? { t: iso(), ev } : { t: iso(), ev, detail };
      list = [...list, e].slice(-max);
      schedule();
      emit();
    },
    entries: () => list,
    clear() {
      list = [];
      dirty = false;
      clearTimeout(timer);
      timer = undefined;
      try {
        storage().removeItem(DIAG_KEY);
      } catch {
        // Nothing to clear.
      }
      emit();
    },
    flush,
    subscribe(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}

export const diag = createDiag();

export const useDiag = (): DiagEntry[] => useSyncExternalStore(diag.subscribe, diag.entries);

/** The log as plain text, newest first, one line per entry. */
export function formatDiag(list: DiagEntry[]): string {
  return [...list]
    .reverse()
    .map((e) => `${e.t} ${e.ev}${e.detail === undefined ? '' : ' ' + JSON.stringify(e.detail)}`)
    .join('\n');
}
