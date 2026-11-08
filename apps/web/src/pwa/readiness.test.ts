// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bootLog, checkReadiness, pageFiles } from './readiness';

describe('pageFiles', () => {
  it("lists the page's scripts, stylesheets and preloads as paths, with the page itself and boot.js", () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="/assets/index-a.css"><link rel="modulepreload" href="/assets/vendor-b.js">';
    document.body.innerHTML =
      '<script type="module" src="/assets/index-c.js"></script><script src="/boot.js"></script>';
    expect(pageFiles(document, location.origin)).toEqual([
      '/',
      '/index.html',
      '/boot.js',
      '/assets/index-a.css',
      '/assets/vendor-b.js',
      '/assets/index-c.js',
    ]);
  });
});

describe('bootLog', () => {
  it('reads boot.js entries, and nothing from a bad value', () => {
    const store = (v: string | null) => ({ getItem: () => v });
    expect(bootLog(store(JSON.stringify([{ t: 'x', ev: 'page loaded' }, { nope: 1 }])))).toEqual([
      { t: 'x', ev: 'page loaded' },
    ]);
    expect(bootLog(store('not json'))).toEqual([]);
    expect(bootLog(store(null))).toEqual([]);
  });
});

describe('checkReadiness', () => {
  it('reports the worker, the caches and whether each file is cached', async () => {
    const cached = new Map([['/', new Response('<html>', { headers: { 'content-type': 'text/html' } })]]);
    const cacheStorage = {
      keys: async () => ['workbox-precache-v2'],
      open: async () => ({ keys: async () => [1, 2, 3] }),
      match: async (u: string) => cached.get(u),
    } as unknown as CacheStorage;
    const container = {
      controller: { scriptURL: `${location.origin}/sw.js`, state: 'activated' },
      getRegistration: async () => ({ active: { state: 'activated' }, waiting: null, installing: null }),
    } as unknown as ServiceWorkerContainer;
    const lines = await checkReadiness({ container, cacheStorage, files: ['/', '/assets/index-c.js'] });
    expect(lines).toEqual([
      `Browser online: ${navigator.onLine}`,
      'Controlling this page: /sw.js (activated)',
      'Registration: active activated, waiting -, installing -',
      'Cache workbox-precache-v2: 3 entries',
      '/: cached (200, text/html)',
      '/assets/index-c.js: NOT cached',
    ]);
  });

  it('says so where there is no service worker or Cache Storage', async () => {
    const lines = await checkReadiness({ container: undefined, cacheStorage: undefined, files: [] });
    expect(lines.slice(1)).toEqual(['Service worker: not supported here', 'Cache Storage: not supported here']);
  });
});
