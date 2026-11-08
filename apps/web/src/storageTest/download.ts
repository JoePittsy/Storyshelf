// The storage test's download: one ABS audio file, streamed chunk by chunk into the chosen backend, never held whole.
import { absFetch } from '../api/auth';
import { absUrl } from '../api/server';
import type { Backend } from './env';
import { formatBytes, formatRate } from './log';
import { fileUrl, playMime, readReply, resumePlan, storedName, type Track } from './plan';
import {
  CACHE_NAME,
  SUBDIR,
  OPFS_DIR,
  cacheRequest,
  metaKey,
  opfsDir,
  opfsSize,
  putMeta,
  readMeta,
  writeRunning,
  type StoredMeta,
} from './stores';
import { startWorker, type WorkerClient, type WorkerReply } from './workerProtocol';

type Log = (msg: string, detail?: unknown) => void;

/**
 * The Authorization header the app sends right now. The access token lives inside api/auth.ts, so this watches one
 * ordinary absFetch go out (which also refreshes the token first if it has expired) and copies its header.
 */
export async function currentAuthHeader(): Promise<string | null> {
  const original = globalThis.fetch;
  let header: string | null = null;
  const watching: typeof fetch = (input, init) => {
    try {
      const h = new Headers(init?.headers).get('authorization');
      if (h) header = h;
    } catch {
      // Not ours to judge: pass it on untouched.
    }
    return original(input, init);
  };
  globalThis.fetch = watching;
  try {
    await absFetch('/api/libraries');
  } finally {
    if (globalThis.fetch === watching) globalThis.fetch = original;
  }
  return header;
}

export interface Progress {
  /** Bytes in storage now, counting what was there before a resume. */
  bytes: number;
  /** Bytes received by this request. */
  received: number;
  total: number | null;
  /** performance.now() when this request's body started. */
  startedAt: number;
}

export interface DownloadOptions {
  backend: Backend;
  itemId: string;
  title: string;
  updatedAt: number;
  track: Track;
  endpoint: string;
  /** createWritable only: close and reopen the file every this many bytes, so a killed app keeps what came before. 0: only at the end. */
  commitEvery: number;
  signal: AbortSignal;
  log: Log;
  onProgress: (p: Progress) => void;
}

interface Sink {
  write(chunk: Uint8Array): Promise<void>;
  /** Commit and release. */
  close(): Promise<void>;
}

const errText = (e: unknown) => `${(e as Error)?.name ?? 'Error'}: ${(e as Error)?.message ?? String(e)}`;

async function writableSink(
  name: string,
  offset: number,
  commitEvery: number,
  log: Log
): Promise<Sink & { written(): number }> {
  const dir = await opfsDir('opfs-writable');
  const fh = await dir.getFileHandle(name, { create: true });
  type Writable = FileSystemWritableFileStream;
  const open = async (at: number): Promise<Writable> => {
    const ws = await fh.createWritable({ keepExistingData: at > 0 });
    if (at > 0) await ws.seek(at);
    else await ws.truncate(0);
    return ws;
  };
  let ws = await open(offset);
  let at = offset;
  let sinceCommit = 0;
  return {
    written: () => at,
    async write(chunk) {
      await ws.write(chunk as Uint8Array<ArrayBuffer>);
      at += chunk.byteLength;
      sinceCommit += chunk.byteLength;
      if (commitEvery > 0 && sinceCommit >= commitEvery) {
        const t0 = performance.now();
        await ws.close();
        ws = await open(at);
        sinceCommit = 0;
        log(`createWritable: committed at ${formatBytes(at)} in ${Math.round(performance.now() - t0)} ms`);
      }
    },
    async close() {
      const t0 = performance.now();
      await ws.close();
      log(`createWritable: closed at ${formatBytes(at)} in ${Math.round(performance.now() - t0)} ms`);
    },
  };
}

const WINDOW = 8; // writes in flight to the worker before waiting for one to land

async function workerSink(
  client: WorkerClient,
  name: string,
  truncate: boolean,
  log: Log
): Promise<Sink & { opened: number }> {
  const opened = await client.call({ op: 'open', dir: [OPFS_DIR, SUBDIR['opfs-sync']], name, truncate });
  log(`Worker: opened ${name} with a sync access handle at ${formatBytes(opened.size)}`);
  const inFlight: Promise<WorkerReply>[] = [];
  return {
    opened: opened.size,
    async write(chunk) {
      // Transfer, not copy: a chunk that owns its whole buffer goes as it is.
      const own = chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength;
      const buf = (own ? chunk.buffer : chunk.slice().buffer) as ArrayBuffer;
      inFlight.push(client.call({ op: 'write', buf }, [buf]));
      if (inFlight.length >= WINDOW) await inFlight.shift();
    },
    async close() {
      try {
        await Promise.all(inFlight.splice(0));
      } finally {
        const r = await client.call({ op: 'close' });
        log(`Worker: flushed and closed at ${formatBytes(r.size)}`);
      }
    },
  };
}

/** fetch with the app's auth; a 401 (token expired) gets a fresh header and one retry. */
async function authedFetch(url: string, range: string | null, signal: AbortSignal, log: Log): Promise<Response> {
  const send = async () => {
    const headers = new Headers();
    const auth = await currentAuthHeader();
    if (auth) headers.set('authorization', auth);
    else log('No access token found: sending without one');
    if (range) headers.set('range', range);
    return fetch(absUrl(url), { headers, signal, cache: 'no-store' });
  };
  let res = await send();
  if (res.status === 401) {
    log('HTTP 401: getting a fresh token and trying again');
    await res.body?.cancel().catch(() => undefined);
    res = await send();
  }
  return res;
}

/** Runs one download. Resolves when it finished, stopped or failed; every outcome is logged, never thrown. */
export async function download(o: DownloadOptions, existingWorker?: () => WorkerClient): Promise<void> {
  const { backend, track, log } = o;
  const filename = track.metadata?.filename ?? `track-${track.index}`;
  const name = storedName(o.itemId, track.ino, filename);
  const key = metaKey(backend, name);
  const expected = track.metadata?.size ?? null;
  const url = fileUrl(o.endpoint, o.itemId, track.ino);
  const prior = readMeta()[key];
  const meta: StoredMeta = {
    backend,
    name,
    itemId: o.itemId,
    ino: track.ino,
    title: o.title,
    updatedAt: o.updatedAt,
    mimeType: playMime(track.mimeType, filename),
    filename,
    expected,
    bytes: prior?.bytes ?? 0,
    complete: false,
    startedAt: prior?.startedAt ?? Date.now(),
    storedAt: null,
  };
  log(`Download start: ${o.title} / ${filename} (${formatBytes(expected)}) -> ${backend} as ${name}`);
  log(`URL: ${absUrl(url)}`);

  // 1. What's there already (OPFS only; a cache entry is all or nothing).
  let existing = 0;
  if (backend !== 'cache') {
    try {
      existing = await opfsSize(backend, name);
    } catch (e) {
      log('Reading the partial file failed', e);
    }
  }
  const plan = resumePlan(existing, expected);
  if (plan.complete) {
    log(`Already complete (${formatBytes(existing)} on disk). Delete it to download again.`);
    putMeta({ ...meta, bytes: existing, complete: true, storedAt: prior?.storedAt ?? Date.now() });
    return;
  }
  if (plan.range)
    log(`Partial file found: ${formatBytes(existing)} of ${formatBytes(expected)}. Asking for ${plan.range}`);

  let worker: WorkerClient | null = null;
  let sink: Sink | null = null;
  let progress: Progress = { bytes: existing, received: 0, total: expected, startedAt: performance.now() };
  let lastSave = 0;
  const t0 = performance.now();
  const save = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSave < 2000) return;
    lastSave = now;
    meta.bytes = progress.bytes;
    putMeta(meta);
    writeRunning({ key, bytes: progress.bytes, at: now });
  };
  try {
    putMeta(meta);
    writeRunning({ key, bytes: existing, at: Date.now() });

    // 2. Ask.
    const res = await authedFetch(url, plan.range, o.signal, log);
    const h = (n: string) => res.headers.get(n);
    log(
      `HTTP ${res.status} after ${Math.round(performance.now() - t0)} ms; content-length ${h('content-length') ?? 'unreadable'}, ` +
        `content-type ${h('content-type') ?? '?'}, content-range ${h('content-range') ?? 'unreadable'}, accept-ranges ${h('accept-ranges') ?? 'unreadable'}`
    );
    const action = readReply(res.status, plan);
    if (plan.range) log(`Range request answered ${res.status}: ${action.kind}`);
    if (action.kind === 'fail') {
      log(`Download failed: ${action.why} ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return;
    }
    if (action.kind === 'complete') {
      await res.body?.cancel().catch(() => undefined);
      log('Server says there is nothing more to send (416): treating as complete');
      meta.complete = true;
      meta.storedAt = Date.now();
      putMeta(meta);
      return;
    }
    if (!res.body) {
      log('The response has no body stream: this browser cannot stream it');
      return;
    }
    const offset = action.kind === 'append' ? action.offset : 0;
    if (plan.range && offset === 0) log('Server ignored the Range: starting again from 0');
    const length = Number(h('content-length'));
    const total = Number.isFinite(length) && length > 0 ? offset + length : expected;
    progress = { bytes: offset, received: 0, total, startedAt: performance.now() };
    o.onProgress(progress);
    const count = (n: number) => {
      progress = { ...progress, bytes: progress.bytes + n, received: progress.received + n };
      o.onProgress(progress);
      save();
    };

    // 3. Store.
    if (backend === 'cache') {
      const reader = res.body.getReader();
      const counted = new ReadableStream<Uint8Array>({
        async pull(ctl) {
          const { done, value } = await reader.read();
          if (done) return ctl.close();
          count(value.byteLength);
          ctl.enqueue(value);
        },
        cancel: (why) => reader.cancel(why),
      });
      const headers = new Headers({ 'content-type': meta.mimeType, 'x-stored-at': new Date().toISOString() });
      if (expected) headers.set('x-test-bytes', String(expected));
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheRequest(name), new Response(counted, { headers }));
    } else {
      if (backend === 'opfs-writable') {
        sink = await writableSink(name, offset, o.commitEvery, log);
      } else {
        worker = existingWorker?.() ?? startWorker();
        const ws = await workerSink(worker, name, offset === 0, log);
        if (ws.opened !== offset) log(`Note: worker opened the file at ${ws.opened}, expected ${offset}`);
        sink = ws;
      }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const n = value.byteLength; // the worker sink transfers the buffer, leaving `value` empty
        await sink.write(value);
        count(n);
      }
      const s = sink;
      sink = null;
      await s.close();
    }

    const ms = performance.now() - progress.startedAt;
    meta.bytes = progress.bytes;
    meta.complete = !expected || progress.bytes >= expected;
    meta.storedAt = Date.now();
    putMeta(meta);
    log(
      `Download done: ${formatBytes(progress.received)} this time, ${formatBytes(progress.bytes)} stored, ` +
        `${(ms / 1000).toFixed(1)} s, ${formatRate(progress.received, ms)}${meta.complete ? '' : ' (short of the expected size)'}`
    );
  } catch (e) {
    const stopped = (e as Error)?.name === 'AbortError';
    log(`${stopped ? 'Download stopped' : 'Download failed'} at ${formatBytes(progress.bytes)}: ${errText(e)}`);
    if (sink) {
      // Keep what arrived, so the next try can resume from it.
      try {
        await sink.close();
      } catch (e2) {
        log('Closing the file after the failure also failed', e2);
      }
    }
    save(true);
  } finally {
    writeRunning(null);
    if (worker && !existingWorker) worker.terminate();
  }
}
