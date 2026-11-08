import { describe, expect, it } from 'vitest';
import { availableBackends, defaultBackend, detectFeatures } from './env';
import { LOG_KEY, createStorageLog, describe as describeDetail, formatBytes, formatLog, formatRate } from './log';
import { fileUrl, largestTrack, playMime, readReply, resumePlan, storedName } from './plan';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

describe('storage test log', () => {
  it('writes every entry through, so a killed app keeps it, and reloads it', () => {
    const store = memoryStorage();
    let n = 0;
    const iso = () => `2026-11-08T10:00:0${n++}.000Z`;
    const a = createStorageLog({ storage: () => store, iso });
    a.log('Download start');
    a.log('Download failed', { name: 'QuotaExceededError', message: 'full' });
    expect(JSON.parse(store.getItem(LOG_KEY) ?? '[]')).toHaveLength(2);
    const b = createStorageLog({ storage: () => store, iso });
    expect(formatLog(b.entries())).toBe(
      '2026-11-08T10:00:00.000Z Download start\n2026-11-08T10:00:01.000Z Download failed QuotaExceededError: full'
    );
  });

  it('keeps the newest entries up to the cap, and survives storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    const l = createStorageLog({ storage: () => throwing, max: 2 });
    l.log('a');
    l.log('b');
    l.log('c');
    expect(l.entries().map((e) => e.msg)).toEqual(['b', 'c']);
  });

  it('ignores a corrupt stored log', () => {
    const store = memoryStorage();
    store.setItem(LOG_KEY, '{nope');
    expect(createStorageLog({ storage: () => store }).entries()).toEqual([]);
  });

  it('describes details and formats sizes and rates', () => {
    expect(describeDetail(new TypeError('Load failed'))).toBe('TypeError: Load failed');
    expect(describeDetail({ a: 1 })).toBe('{"a":1}');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(undefined)).toBe('?');
    expect(formatRate(10 * 1024 * 1024, 2000)).toBe('5.00 MB/s');
    expect(formatRate(1, 0)).toBe('?');
  });
});

describe('resume', () => {
  it('asks for the rest of a partial file', () => {
    expect(resumePlan(0, 1000)).toEqual({ range: null, offset: 0, complete: false });
    expect(resumePlan(400, 1000)).toEqual({ range: 'bytes=400-', offset: 400, complete: false });
    expect(resumePlan(1000, 1000).complete).toBe(true);
    expect(resumePlan(400, null).range).toBe('bytes=400-');
    expect(resumePlan(Number.NaN, 1000).range).toBeNull();
  });

  it('appends on 206, restarts when the server ignores the Range, and fails on errors', () => {
    const partial = resumePlan(400, 1000);
    expect(readReply(206, partial)).toEqual({ kind: 'append', offset: 400 });
    expect(readReply(200, partial)).toEqual({ kind: 'restart' });
    expect(readReply(416, partial)).toEqual({ kind: 'complete' });
    expect(readReply(403, partial)).toEqual({ kind: 'fail', why: 'HTTP 403' });
    expect(readReply(200, resumePlan(0, 1000))).toEqual({ kind: 'restart' });
  });
});

describe('plan helpers', () => {
  it('fills the endpoint template', () => {
    expect(fileUrl('/api/items/{id}/file/{ino}/download', 'li_1', '123')).toBe('/api/items/li_1/file/123/download');
  });

  it('picks the largest track', () => {
    const t = (ino: string, size?: number) => ({ index: 1, ino, metadata: { size } });
    expect(largestTrack([t('a', 5), t('b', 50), t('c')])?.ino).toBe('b');
    expect(largestTrack([])).toBeUndefined();
  });

  it('gives WebKit a MIME type it knows', () => {
    expect(playMime('audio/m4b', 'x.m4b')).toBe('audio/mp4');
    expect(playMime('audio/mpeg', 'x.mp3')).toBe('audio/mpeg');
    expect(playMime(undefined, 'x.mp3')).toBe('audio/mpeg');
    expect(playMime('', 'x.m4b')).toBe('audio/mp4');
  });

  it('makes safe stored names', () => {
    expect(storedName('li 1/x', '99', 'Book: one.m4b')).toBe('li_1_x-99.m4b');
  });
});

describe('feature detection', () => {
  it('treats a bare environment as supporting nothing', () => {
    const f = detectFeatures({});
    expect(f.opfs || f.createWritable || f.cacheStorage || f.worker || f.standalone).toBe(false);
    expect(availableBackends(f, null)).toEqual([]);
  });

  it('reads an iOS 17-like environment: OPFS and worker, no createWritable', () => {
    class Handle {}
    Object.assign(Handle.prototype, { createSyncAccessHandle() {} });
    const f = detectFeatures({
      navigator: { userAgent: 'iPhone', standalone: true, storage: { getDirectory: async () => ({}) as never } },
      FileSystemFileHandle: Handle,
      Worker: class {},
      caches: {},
      indexedDB: {},
    });
    expect(f).toMatchObject({ standalone: true, opfs: true, createWritable: false, syncAccessHandleProto: true });
    const b = availableBackends(f, null);
    expect(b).toEqual(['opfs-sync', 'cache']);
    expect(defaultBackend(b)).toBe('opfs-sync');
    expect(availableBackends(f, false)).toEqual(['cache']);
  });

  it('prefers createWritable when there is one, and reads standalone from matchMedia', () => {
    class Handle {}
    Object.assign(Handle.prototype, { createWritable() {}, createSyncAccessHandle() {} });
    const f = detectFeatures({
      navigator: { storage: { getDirectory: async () => ({}) as never }, deviceMemory: 8 },
      matchMedia: () => ({ matches: true }),
      FileSystemFileHandle: Handle,
      Worker: class {},
      performance: { memory: { usedJSHeapSize: 1, jsHeapSizeLimit: 2 } },
    });
    expect(f.standalone).toBe(true);
    expect(f.deviceMemory).toBe(8);
    expect(f.jsHeap).toEqual({ used: 1, limit: 2 });
    expect(defaultBackend(availableBackends(f, true))).toBe('opfs-writable');
  });
});
