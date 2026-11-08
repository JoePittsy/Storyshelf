import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownloadManager, type Env, type Net } from './manager';
import { WHY, type ExpandedItem } from './plan';
import type { FileStore, MetaStore } from './storage';
import type { DownloadRecord, DownloadedBook } from './types';

// Fakes: files and records in memory, the network as scripted replies, the browser as switches.

function memoryFiles() {
  const data = new Map<string, number[]>();
  const key = (id: string, name: string) => `${id}/${name}`;
  let failWrite: Error | null = null;
  const files: FileStore = {
    size: async (id, name) => data.get(key(id, name))?.length ?? 0,
    open: async (id, name, truncate) => {
      const k = key(id, name);
      if (truncate || !data.has(k)) data.set(k, []);
      const bytes = data.get(k)!;
      return {
        opened: bytes.length,
        write: async (chunk) => {
          if (failWrite) throw failWrite;
          bytes.push(...chunk);
        },
        close: async () => bytes.length,
      };
    },
    file: async (id, name) => {
      const b = data.get(key(id, name));
      return b ? new Blob([new Uint8Array(b)]) : null;
    },
    removeBook: async (id) => {
      for (const k of [...data.keys()]) if (k.startsWith(`${id}/`)) data.delete(k);
    },
    idle: vi.fn(),
  };
  return { files, data, failWriteWith: (e: Error | null) => (failWrite = e) };
}

function memoryMeta(initial: DownloadRecord[] = []) {
  const m = new Map(initial.map((r) => [r.itemId, structuredClone(r)]));
  const meta: MetaStore = {
    all: async () => [...m.values()].map((r) => structuredClone(r)),
    get: async (id) => m.get(id),
    put: async (r) => void m.set(r.itemId, structuredClone(r)),
    del: async (id) => void m.delete(id),
  };
  return { meta, m };
}

const item = (sizes: number[], id = 'li_1'): ExpandedItem => ({
  id,
  libraryId: 'lib_1',
  updatedAt: 5,
  media: {
    metadata: { title: 'The Hobbit', authorName: 'J. R. R. Tolkien' },
    duration: 600,
    chapters: [{ id: 0, start: 0, end: 600, title: '01 - An Unexpected Party' }],
    tracks: sizes
      .map((size, i) => ({
        index: i + 1,
        ino: String(100 + i),
        startOffset: i * 300,
        duration: 300,
        mimeType: 'audio/m4b',
        metadata: { filename: `part${i + 1}.m4b`, size },
      }))
      .reverse(), // out of order: play order comes from index
  },
});

/** A reply whose body sends `bytes` in chunks, then optionally fails mid-way. */
function reply(status: number, bytes: number, opts: { failAfter?: number; chunk?: number } = {}): Response {
  const chunk = opts.chunk ?? 4;
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(ctl) {
      if (opts.failAfter !== undefined && sent >= opts.failAfter) {
        ctl.error(new TypeError('Load failed'));
        return;
      }
      if (sent >= bytes) return ctl.close();
      const n = Math.min(chunk, bytes - sent);
      ctl.enqueue(new Uint8Array(n).fill(7));
      sent += n;
    },
  });
  return new Response(body, { status });
}

function fakeEnv(over: Partial<Env> = {}) {
  let online = true;
  let visible = true;
  const onOnline = new Set<() => void>();
  const onVisible = new Set<() => void>();
  let t = 1000;
  const env: Env = {
    online: () => online,
    onOnline: (cb) => (onOnline.add(cb), () => void onOnline.delete(cb)),
    visible: () => visible,
    onVisible: (cb) => (onVisible.add(cb), () => void onVisible.delete(cb)),
    estimate: async () => ({ quota: 10e9, usage: 1e9 }),
    persist: vi.fn(async () => true),
    user: () => ({ id: 'u1', permissions: { download: true } }),
    server: () => 'same-origin',
    objectUrl: vi.fn((b: Blob) => `blob:${b.type}:${b.size}`),
    revokeUrl: vi.fn(),
    keepAwake: vi.fn(),
    now: () => (t += 1000),
    sleep: vi.fn(async () => undefined),
    ...over,
  };
  return {
    env,
    goOffline: () => (online = false),
    goOnline: () => {
      online = true;
      onOnline.forEach((cb) => cb());
    },
    hide: () => (visible = false),
    show: () => {
      visible = true;
      onVisible.forEach((cb) => cb());
    },
  };
}

interface Setup {
  sizes?: number[];
  records?: DownloadRecord[];
  file?: Net['file'];
  env?: Partial<Env>;
  cover?: Net['cover'];
}

function setup(o: Setup = {}) {
  const f = memoryFiles();
  const meta = memoryMeta(o.records);
  const e = fakeEnv(o.env);
  const published: DownloadedBook[][] = [];
  const net: Net = {
    item: vi.fn(async (id: string) => item(o.sizes ?? [10, 6], id)),
    file: vi.fn(o.file ?? (async (_id, ino) => reply(200, ino === '100' ? (o.sizes?.[0] ?? 10) : (o.sizes?.[1] ?? 6)))),
    cover: vi.fn(o.cover ?? (async () => new Blob([new Uint8Array(3)], { type: 'image/jpeg' }))),
  };
  const m = new DownloadManager({
    meta: meta.meta,
    files: f.files,
    net,
    env: e.env,
    publish: (b) => published.push(b),
  });
  const last = () => published[published.length - 1] ?? [];
  /** Waits until the book reaches `status`. */
  const until = async (status: string, id = 'li_1') => {
    await vi.waitFor(() => expect(last().find((b) => b.itemId === id)?.status).toBe(status));
  };
  return { m, f, meta, e, net, published, last, until };
}

const record = (over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  itemId: 'li_1',
  libraryId: 'lib_1',
  title: 'The Hobbit',
  author: 'J. R. R. Tolkien',
  duration: 600,
  chapters: [],
  tracks: [
    {
      index: 1,
      ino: '100',
      filename: 'part1.m4b',
      mimeType: 'audio/mp4',
      size: 10,
      startOffset: 0,
      duration: 300,
    },
    { index: 2, ino: '101', filename: 'part2.m4b', mimeType: 'audio/mp4', size: 6, startOffset: 300, duration: 300 },
  ],
  updatedAt: 5,
  totalBytes: 16,
  bytes: 0,
  status: 'queued',
  addedAt: 1,
  hasCover: false,
  ...over,
});

let current: DownloadManager | null = null;
afterEach(() => {
  current?.dispose();
  current = null;
});

describe('download manager', () => {
  it('downloads every file in play order, with the cover, and keeps what playing offline needs', async () => {
    const s = setup();
    current = s.m;
    expect(await s.m.start('li_1')).toEqual({ ok: true });
    await s.until('complete');
    expect(vi.mocked(s.net.file).mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['100', null],
      ['101', null],
    ]);
    expect(s.f.data.get('li_1/100.m4b')).toHaveLength(10);
    expect(s.f.data.get('li_1/101.m4b')).toHaveLength(6);
    expect(s.f.data.get('li_1/cover.jpg')).toHaveLength(3);
    const book = s.last()[0]!;
    expect(book).toMatchObject({ status: 'complete', bytes: 16, totalBytes: 16, title: 'The Hobbit' });
    expect(book.coverUrl).toBe('blob:image/jpeg:3');
    const saved = await s.m.item('li_1');
    expect(saved?.tracks.map((t) => [t.ino, t.mimeType, t.startOffset])).toEqual([
      ['100', 'audio/mp4', 0],
      ['101', 'audio/mp4', 300],
    ]);
    expect(saved?.chapters[0]?.title).toBe('An Unexpected Party');
    expect(s.meta.m.get('li_1')?.status).toBe('complete');
    expect(s.e.env.keepAwake).toHaveBeenCalledWith(true);
    expect(s.e.env.keepAwake).toHaveBeenLastCalledWith(false);
  });

  it('asks the browser to keep its storage on the first download only', async () => {
    const s = setup();
    current = s.m;
    await s.m.start('li_1');
    await s.m.start('li_2');
    expect(s.e.env.persist).toHaveBeenCalledTimes(1);
  });

  it('goes queued, downloading, complete, and runs one book at a time', async () => {
    const s = setup();
    current = s.m;
    await s.m.start('li_1');
    await s.m.start('li_2');
    await s.until('complete', 'li_2');
    const seen = (id: string) =>
      s.published.map((l) => l.find((b) => b.itemId === id)?.status).filter((x, i, a) => x && x !== a[i - 1]);
    expect(seen('li_1')).toEqual(['queued', 'downloading', 'complete']);
    expect(seen('li_2')).toEqual(['queued', 'downloading', 'complete']);
    // Never both downloading at once.
    expect(s.published.some((l) => l.filter((b) => b.status === 'downloading').length > 1)).toBe(false);
    // Newest first.
    expect(s.last().map((b) => b.itemId)).toEqual(['li_2', 'li_1']);
  });

  it('resumes a partial file with a Range request and appends a 206', async () => {
    const s = setup({
      records: [record({ status: 'paused', bytes: 4 })],
      file: async (_id, ino, range) => (ino === '100' ? reply(range ? 206 : 200, range ? 6 : 10) : reply(200, 6)),
    });
    current = s.m;
    await s.m.ready;
    s.f.data.set('li_1/100.m4b', [1, 2, 3, 4]);
    s.m.resume('li_1');
    await s.until('complete');
    expect(vi.mocked(s.net.file).mock.calls[0]?.[2]).toBe('bytes=4-');
    expect(s.f.data.get('li_1/100.m4b')).toEqual([1, 2, 3, 4, 7, 7, 7, 7, 7, 7]);
  });

  it('starts a file again from 0 when the server answers a Range request with 200', async () => {
    const s = setup({ records: [record({ status: 'paused', bytes: 4 })] });
    current = s.m;
    await s.m.ready;
    s.f.data.set('li_1/100.m4b', [1, 2, 3, 4]);
    s.m.resume('li_1');
    await s.until('complete');
    expect(vi.mocked(s.net.file).mock.calls[0]?.[2]).toBe('bytes=4-');
    expect(s.f.data.get('li_1/100.m4b')).toEqual(new Array(10).fill(7));
  });

  it('skips files that are already whole', async () => {
    const s = setup({ records: [record({ status: 'paused' })] });
    current = s.m;
    await s.m.ready;
    s.f.data.set('li_1/100.m4b', new Array(10).fill(1));
    s.m.resume('li_1');
    await s.until('complete');
    expect(vi.mocked(s.net.file).mock.calls.map((c) => c[1])).toEqual(['101']);
  });

  it('retries a dropped connection, resuming from what arrived', async () => {
    let n = 0;
    const s = setup({
      file: async (_id, ino, range) => {
        if (ino === '101') return reply(200, 6);
        return n++ === 0 ? reply(200, 10, { failAfter: 4 }) : reply(206, 10 - Number(range?.slice(6, -1)));
      },
    });
    current = s.m;
    await s.m.start('li_1');
    await s.until('complete');
    expect(s.e.env.sleep).toHaveBeenCalledTimes(1);
    expect(vi.mocked(s.net.file).mock.calls[1]?.[2]).toBe('bytes=4-');
    expect(s.f.data.get('li_1/100.m4b')).toHaveLength(10);
  });

  it('gives up after the last retry and says why', async () => {
    const s = setup({ file: async () => Promise.reject(new TypeError('Load failed')) });
    current = s.m;
    await s.m.start('li_1');
    await s.until('failed');
    expect(s.last()[0]?.error).toBe(WHY.unreachable);
    expect(s.e.env.sleep).toHaveBeenCalledTimes(5);
  });

  it('pauses when the connection goes, and carries on when it comes back', async () => {
    let fail = true;
    const s = setup({
      file: async (_id, ino) => {
        if (fail) {
          fail = false;
          s.e.goOffline();
          throw new TypeError('Load failed');
        }
        return reply(200, ino === '100' ? 10 : 6);
      },
    });
    current = s.m;
    await s.m.start('li_1');
    await s.until('paused');
    expect(s.last()[0]?.error).toBe(WHY.offline);
    s.e.goOnline();
    await s.until('complete');
  });

  it('pauses when the app goes to the background, and carries on when it is back on screen', async () => {
    let fail = true;
    const s = setup({
      file: async (_id, ino) => {
        if (fail) {
          fail = false;
          s.e.hide();
          throw new TypeError('Load failed');
        }
        return reply(200, ino === '100' ? 10 : 6);
      },
    });
    current = s.m;
    await s.m.start('li_1');
    await s.until('paused');
    expect(s.last()[0]?.error).toBe(WHY.background);
    s.e.show();
    await s.until('complete');
  });

  it('fails without retrying when the server says no (403)', async () => {
    const s = setup({ file: async () => new Response('Forbidden', { status: 403 }) });
    current = s.m;
    await s.m.start('li_1');
    await s.until('failed');
    expect(s.last()[0]?.error).toBe(WHY.noPermission);
    expect(s.e.env.sleep).not.toHaveBeenCalled();
  });

  it('fails when the device runs out of space mid-way', async () => {
    const s = setup();
    current = s.m;
    s.f.failWriteWith(Object.assign(new Error('WorkerError: QuotaExceededError: full'), { name: 'WorkerError' }));
    await s.m.start('li_1');
    await s.until('failed');
    expect(s.last()[0]?.error).toBe(WHY.full);
  });

  it('pauses and resumes at the listener’s say, with no reason given', async () => {
    let first = true;
    const s = setup({
      file: async (_id, ino, _range, signal) => {
        if (first) {
          first = false;
          // Hangs until aborted.
          await new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
          );
        }
        return reply(200, ino === '100' ? 10 : 6);
      },
    });
    current = s.m;
    await s.m.start('li_1');
    await vi.waitFor(() => expect(s.net.file).toHaveBeenCalled());
    s.m.pause('li_1');
    await s.until('paused');
    expect(s.last()[0]?.error).toBeUndefined();
    // A listener's pause isn't undone by coming back online.
    s.e.goOnline();
    expect(s.last()[0]?.status).toBe('paused');
    s.m.resume('li_1');
    await s.until('complete');
  });

  it('refuses to start offline, without the permission, or when the book will not fit', async () => {
    const offline = setup();
    current = offline.m;
    offline.e.goOffline();
    expect(await offline.m.start('li_1')).toMatchObject({ ok: false, reason: expect.stringMatching(/offline/) });
    offline.m.dispose();

    const noPerm = setup({ env: { user: () => ({ id: 'u2', permissions: { download: false } }) } });
    current = noPerm.m;
    expect(await noPerm.m.start('li_1')).toEqual({ ok: false, reason: WHY.noPermission });
    expect(noPerm.net.item).not.toHaveBeenCalled();
    noPerm.m.dispose();

    const full = setup({ sizes: [600e6, 400e6], env: { estimate: async () => ({ quota: 2e9, usage: 1.2e9 }) } });
    current = full.m;
    expect(await full.m.start('li_1')).toEqual({
      ok: false,
      reason: 'Not enough space on this device: the book needs 1.0 GB and 800 MB is free.',
    });
    expect(full.last()).toEqual([]);
  });

  it('removes a book: files, record and object URLs', async () => {
    const s = setup();
    current = s.m;
    await s.m.start('li_1');
    await s.until('complete');
    const urls = await s.m.localTrackUrls('li_1');
    expect(urls).toEqual(['blob:audio/mp4:10', 'blob:audio/mp4:6']);
    await s.m.remove('li_1');
    expect(s.last()).toEqual([]);
    expect([...s.f.data.keys()]).toEqual([]);
    expect(s.meta.m.size).toBe(0);
    expect(vi.mocked(s.e.env.revokeUrl).mock.calls.map((c) => c[0])).toEqual([
      'blob:image/jpeg:3',
      'blob:audio/mp4:10',
      'blob:audio/mp4:6',
    ]);
    expect(await s.m.localTrackUrls('li_1')).toBeNull();
  });

  it('cancels a download in progress and deletes what arrived', async () => {
    const s = setup({
      file: async (_id, _ino, _range, signal) => {
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
        );
        return reply(200, 1);
      },
    });
    current = s.m;
    await s.m.start('li_1');
    await s.until('downloading');
    await s.m.remove('li_1');
    expect(s.last()).toEqual([]);
    expect(s.meta.m.size).toBe(0);
    expect([...s.f.data.keys()]).toEqual([]);
  });

  it('gives no track URLs until the book is whole', async () => {
    const s = setup({ records: [record({ status: 'paused', bytes: 4 })] });
    current = s.m;
    expect(await s.m.localTrackUrls('li_1')).toBeNull();
    expect(await s.m.localTrackUrls('nope')).toBeNull();
  });

  it('at launch, pauses a book left downloading with a reason, then carries on by itself', async () => {
    const s = setup({ records: [record({ status: 'downloading', bytes: 4 })], env: { visible: () => false } });
    current = s.m;
    await s.m.ready;
    expect(s.last()[0]).toMatchObject({ status: 'paused', error: WHY.closed });
    expect(s.meta.m.get('li_1')?.status).toBe('paused');
    s.m.dispose();

    const back = setup({ records: [record({ status: 'downloading', bytes: 4 })] });
    current = back.m;
    await back.until('complete');
  });

  it('at launch, leaves a book the listener paused alone', async () => {
    const s = setup({ records: [record({ status: 'paused', bytes: 4 })] });
    current = s.m;
    await s.m.ready;
    s.e.goOnline();
    s.e.show();
    expect(s.last()[0]?.status).toBe('paused');
    expect(s.net.file).not.toHaveBeenCalled();
  });

  it('tells the store about every change', async () => {
    const s = setup();
    current = s.m;
    await s.m.ready;
    const before = s.published.length;
    await s.m.start('li_1');
    await s.until('complete');
    expect(s.published.length).toBeGreaterThan(before + 2);
    // A new array each time.
    expect(new Set(s.published).size).toBe(s.published.length);
  });
});
