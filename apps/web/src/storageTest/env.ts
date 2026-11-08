// Feature detection for the storage test. Takes the globals as an argument so tests can stub them.

export interface Features {
  userAgent: string;
  /** display-mode: standalone, or iOS's navigator.standalone. */
  standalone: boolean;
  storageManager: boolean;
  estimate: boolean;
  persisted: boolean;
  persist: boolean;
  opfs: boolean;
  createWritable: boolean;
  /** On the main thread's prototype. Only usable in a Worker; the worker probe checks that for real. */
  syncAccessHandleProto: boolean;
  worker: boolean;
  cacheStorage: boolean;
  indexedDB: boolean;
  readableStream: boolean;
  mediaSession: boolean;
  serviceWorkerControlled: boolean;
  deviceMemory: number | null;
  jsHeap: { used: number; limit: number } | null;
}

/** The parts of `window` detection reads. Every field is optional: anything missing counts as unsupported. */
export interface EnvLike {
  navigator?: {
    userAgent?: string;
    standalone?: boolean;
    storage?: Partial<StorageManager>;
    mediaSession?: unknown;
    serviceWorker?: { controller?: unknown };
    deviceMemory?: number;
  };
  matchMedia?: (q: string) => { matches: boolean };
  FileSystemFileHandle?: { prototype: object };
  Worker?: unknown;
  caches?: unknown;
  indexedDB?: unknown;
  ReadableStream?: unknown;
  performance?: { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } };
}

const has = (o: object | undefined | null, key: string): boolean => {
  try {
    return !!o && key in o;
  } catch {
    return false;
  }
};

export function detectFeatures(env: EnvLike): Features {
  const nav = env.navigator ?? {};
  const storage = nav.storage;
  const proto = env.FileSystemFileHandle?.prototype;
  let standalone = nav.standalone === true;
  try {
    standalone ||= !!env.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    // No matchMedia: rely on navigator.standalone.
  }
  const mem = env.performance?.memory;
  return {
    userAgent: nav.userAgent ?? '',
    standalone,
    storageManager: !!storage,
    estimate: typeof storage?.estimate === 'function',
    persisted: typeof storage?.persisted === 'function',
    persist: typeof storage?.persist === 'function',
    opfs: typeof storage?.getDirectory === 'function',
    createWritable: has(proto, 'createWritable'),
    syncAccessHandleProto: has(proto, 'createSyncAccessHandle'),
    worker: typeof env.Worker === 'function',
    cacheStorage: !!env.caches,
    indexedDB: !!env.indexedDB,
    readableStream: typeof env.ReadableStream === 'function',
    mediaSession: !!nav.mediaSession,
    serviceWorkerControlled: !!nav.serviceWorker?.controller,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    jsHeap:
      mem && typeof mem.usedJSHeapSize === 'number' && typeof mem.jsHeapSizeLimit === 'number'
        ? { used: mem.usedJSHeapSize, limit: mem.jsHeapSizeLimit }
        : null,
  };
}

export const currentFeatures = (): Features => detectFeatures(window as unknown as EnvLike);

export type Backend = 'cache' | 'opfs-writable' | 'opfs-sync';

export const BACKEND_LABELS: Record<Backend, string> = {
  cache: 'Cache Storage',
  'opfs-writable': 'OPFS, createWritable (main thread)',
  'opfs-sync': 'OPFS, sync access handle (worker)',
};

/** Backends this browser seems to have. The worker one is a guess until the worker probe answers. */
export function availableBackends(f: Features, workerSync: boolean | null): Backend[] {
  const out: Backend[] = [];
  if (f.opfs && f.worker && workerSync !== false) out.push('opfs-sync');
  if (f.opfs && f.createWritable) out.push('opfs-writable');
  if (f.cacheStorage) out.push('cache');
  return out;
}

/** The default: createWritable when there is one (iOS 26+), else the worker (iOS 17–25), else Cache Storage. */
export function defaultBackend(available: Backend[]): Backend | undefined {
  return (['opfs-writable', 'opfs-sync', 'cache'] as const).find((b) => available.includes(b));
}
