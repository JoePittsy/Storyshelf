// Where downloads live: each book's files in OPFS (storyshelf-downloads/<itemId>/), written through the storage test's
// worker with a sync access handle (proven on iOS 17 and up), and the book's details in IndexedDB.
import { createStore, del, get, set, values } from 'idb-keyval';
import { startWorker, type WorkerClient, type WorkerReply } from '../storageTest/workerProtocol';
import { DOWNLOADS_DIR, safeName } from './plan';
import type { DownloadRecord } from './types';

/** The book records. */
export interface MetaStore {
  all(): Promise<DownloadRecord[]>;
  get(itemId: string): Promise<DownloadRecord | undefined>;
  put(record: DownloadRecord): Promise<void>;
  del(itemId: string): Promise<void>;
}

/** One file open for writing, from where it stands. */
export interface FileWriter {
  /** The file's size when it was opened (0 after a truncate). */
  readonly opened: number;
  write(chunk: Uint8Array): Promise<void>;
  /** Waits for every write, flushes and lets the file go. Resolves with its size. */
  close(): Promise<number>;
}

/** The books' files. */
export interface FileStore {
  /** Bytes in a book's file; 0 when there's none. */
  size(itemId: string, name: string): Promise<number>;
  /** One file at a time. `truncate` empties it first. */
  open(itemId: string, name: string, truncate: boolean): Promise<FileWriter>;
  /** The stored file, or null. OPFS hands it back with no type; the caller gives it one. */
  file(itemId: string, name: string): Promise<Blob | null>;
  /** Deletes a book's folder. Nothing there is fine. */
  removeBook(itemId: string): Promise<void>;
  /** Nothing is downloading: free the worker. */
  idle(): void;
}

let idb: ReturnType<typeof createStore> | undefined;
const db = () => (idb ??= createStore('storyshelf-downloads', 'books'));

export const idbMeta: MetaStore = {
  all: () => values<DownloadRecord>(db()),
  get: (itemId) => get<DownloadRecord>(itemId, db()),
  put: (r) => set(r.itemId, r, db()),
  del: (itemId) => del(itemId, db()),
};

const notFound = (e: unknown) => (e as { name?: string } | null)?.name === 'NotFoundError';

async function bookDir(itemId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const top = await root.getDirectoryHandle(DOWNLOADS_DIR, { create });
  return top.getDirectoryHandle(safeName(itemId), { create });
}

/** Writes in flight to the worker before waiting for one to land (as the storage test). */
const WINDOW = 8;

export function opfsFiles(start: () => WorkerClient = startWorker): FileStore {
  let client: WorkerClient | null = null;
  const worker = () => (client ??= start());
  return {
    async size(itemId, name) {
      try {
        return (await (await (await bookDir(itemId, false)).getFileHandle(name)).getFile()).size;
      } catch (e) {
        if (notFound(e)) return 0;
        throw e;
      }
    },
    async open(itemId, name, truncate) {
      const c = worker();
      const r = await c.call({ op: 'open', dir: [DOWNLOADS_DIR, safeName(itemId)], name, truncate });
      const inFlight: Promise<WorkerReply>[] = [];
      return {
        opened: r.size,
        async write(chunk) {
          // Transfer, not copy: a chunk that owns its whole buffer goes as it is.
          const own = chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength;
          const buf = (own ? chunk.buffer : chunk.slice().buffer) as ArrayBuffer;
          inFlight.push(c.call({ op: 'write', buf }, [buf]));
          if (inFlight.length >= WINDOW) await inFlight.shift();
        },
        async close() {
          let failed: unknown = null;
          try {
            await Promise.all(inFlight.splice(0));
          } catch (e) {
            failed = e;
          }
          // Always let the file go, so the next open (or a removal) isn't locked out by this one.
          const { size } = await c.call({ op: 'close' });
          if (failed) throw failed;
          return size;
        },
      };
    },
    async file(itemId, name) {
      try {
        return await (await (await bookDir(itemId, false)).getFileHandle(name)).getFile();
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async removeBook(itemId) {
      try {
        const root = await navigator.storage.getDirectory();
        const top = await root.getDirectoryHandle(DOWNLOADS_DIR);
        await top.removeEntry(safeName(itemId), { recursive: true });
      } catch (e) {
        if (!notFound(e)) throw e;
      }
    },
    idle() {
      client?.terminate();
      client = null;
    },
  };
}
