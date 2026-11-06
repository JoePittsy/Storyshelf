/**
 * Tests for hosted-mode plumbing: apps/web/src/api/server.ts
 * URL normalisation, mode detection, server probing/error classification, absolute URL building.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ServerProbeError,
  absUrl,
  decideMode,
  detectMode,
  getMode,
  getServerUrl,
  normalizeServerUrl,
  probeServer,
  resetServerForTests,
  setMode,
  setServerUrl,
} from './server';
import { authorImageUrl, coverUrl } from './libraries';
import { coverUrl as bookCoverUrl } from './items';
import { trackUrl } from '../player/session';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  resetServerForTests();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ABS = { app: 'audiobookshelf', serverVersion: '2.37.2', isInit: true, authMethods: ['local'] };

describe('normalizeServerUrl', () => {
  it.each([
    ['abs.example.com', 'https://abs.example.com'],
    ['  abs.example.com  ', 'https://abs.example.com'],
    ['https://abs.example.com/', 'https://abs.example.com'],
    ['https://abs.example.com///', 'https://abs.example.com'],
    ['https://abs.example.com/login', 'https://abs.example.com'],
    ['https://abs.example.com/login/', 'https://abs.example.com'],
    ['http://192.168.1.5:13378', 'http://192.168.1.5:13378'],
    ['192.168.1.5:13378/login', 'https://192.168.1.5:13378'],
    ['HTTPS://ABS.Example.com', 'https://abs.example.com'],
    ['https://example.com/abs/', 'https://example.com/abs'],
    ['https://example.com/abs/login', 'https://example.com/abs'],
    ['https://abs.example.com/?x=1#top', 'https://abs.example.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected);
  });

  it.each([[''], ['   '], ['ftp://abs.example.com'], ['https://']])('rejects %j', (input) => {
    expect(normalizeServerUrl(input)).toBeNull();
  });
});

describe('decideMode', () => {
  it('uses same-origin when our own origin answers as ABS', () => {
    expect(decideMode('abs')).toBe('same-origin');
    expect(decideMode('abs', 'hosted')).toBe('same-origin');
  });
  it('uses hosted when our origin answers with something else (static host)', () => {
    expect(decideMode('other')).toBe('hosted');
    expect(decideMode('other', 'same-origin')).toBe('hosted');
  });
  it('falls back to the remembered mode, then same-origin, when the probe fails', () => {
    expect(decideMode('unreachable', 'hosted')).toBe('hosted');
    expect(decideMode('unreachable', null)).toBe('same-origin');
    expect(decideMode('unreachable')).toBe('same-origin');
  });
});

describe('detectMode', () => {
  it('picks same-origin for ABS JSON', async () => {
    const f = vi.fn(() => Promise.resolve(json(ABS)));
    await expect(detectMode(f as never)).resolves.toBe('same-origin');
    expect(f).toHaveBeenCalledWith('/status');
    expect(getMode()).toBe('same-origin');
  });
  it('picks hosted for an index.html fallback', async () => {
    const f = () => Promise.resolve(new Response('<!doctype html>', { status: 200 }));
    await expect(detectMode(f as never)).resolves.toBe('hosted');
    expect(getMode()).toBe('hosted');
  });
  it('picks hosted for a 404', async () => {
    const f = () => Promise.resolve(new Response('nope', { status: 404 }));
    await expect(detectMode(f as never)).resolves.toBe('hosted');
  });
  it('picks hosted for JSON that is not ABS', async () => {
    const f = () => Promise.resolve(json({ status: 'ok' }));
    await expect(detectMode(f as never)).resolves.toBe('hosted');
  });
  it('reuses the remembered mode when offline', async () => {
    await detectMode((() => Promise.resolve(new Response('x'))) as never);
    resetServerForTests();
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(detectMode(offline as never)).resolves.toBe('hosted');
  });
});

describe('probeServer', () => {
  const ok = () => Promise.resolve(json(ABS));

  it('GETs <url>/status and returns the status', async () => {
    const f = vi.fn(ok);
    const status = await probeServer('https://abs.example.com', { fetchFn: f as never, pageProtocol: 'https:' });
    expect(f).toHaveBeenCalledWith('https://abs.example.com/status');
    expect(status.serverVersion).toBe('2.37.2');
  });

  async function kindOf(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      if (e instanceof ServerProbeError) return e.kind;
      throw e;
    }
    return 'no error';
  }

  it('classifies a fetch TypeError as cors-or-offline', async () => {
    const f = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await kindOf(probeServer('https://abs.example.com', { fetchFn: f as never, pageProtocol: 'https:' }))).toBe(
      'cors-or-offline',
    );
  });

  it('classifies http from an https page as mixed-content without fetching', async () => {
    const f = vi.fn(ok);
    expect(await kindOf(probeServer('http://abs.example.com', { fetchFn: f as never, pageProtocol: 'https:' }))).toBe(
      'mixed-content',
    );
    expect(f).not.toHaveBeenCalled();
  });

  it('allows http from an http page, and http://localhost from an https page', async () => {
    await expect(probeServer('http://192.168.1.5:13378', { fetchFn: ok as never, pageProtocol: 'http:' })).resolves.toBeDefined();
    await expect(probeServer('http://localhost:13378', { fetchFn: ok as never, pageProtocol: 'https:' })).resolves.toBeDefined();
  });

  it('classifies a reachable non-ABS answer as not-abs', async () => {
    const html = () => Promise.resolve(new Response('<html>', { status: 200 }));
    const nope = () => Promise.resolve(new Response('', { status: 404 }));
    const other = () => Promise.resolve(json({ hello: 'world' }));
    for (const f of [html, nope, other]) {
      expect(await kindOf(probeServer('https://x.example.com', { fetchFn: f as never, pageProtocol: 'https:' }))).toBe('not-abs');
    }
  });
});

describe('absUrl and URL builders', () => {
  it('is the identity in same-origin mode', () => {
    setMode('same-origin');
    setServerUrl(null);
    expect(absUrl('/api/me')).toBe('/api/me');
    expect(coverUrl({ id: 'i1', updatedAt: 5 })).toBe('/api/items/i1/cover?width=400&format=webp&ts=5');
  });

  it('prefixes every builder with the stored server in hosted mode', () => {
    setMode('hosted');
    setServerUrl('https://abs.example.com');
    expect(getServerUrl()).toBe('https://abs.example.com');
    expect(absUrl('/api/me')).toBe('https://abs.example.com/api/me');
    expect(coverUrl({ id: 'i1', updatedAt: 5 })).toBe('https://abs.example.com/api/items/i1/cover?width=400&format=webp&ts=5');
    expect(bookCoverUrl('i1', 5)).toBe('https://abs.example.com/api/items/i1/cover?width=800&format=webp&ts=5');
    expect(authorImageUrl({ id: 'a1', imagePath: '/x', updatedAt: 2 }, 64)).toBe(
      'https://abs.example.com/api/authors/a1/image?width=64&format=webp&ts=2',
    );
    expect(authorImageUrl({ id: 'a1' })).toBeUndefined();
    expect(trackUrl({ id: 's1' } as never, 3)).toBe('https://abs.example.com/public/session/s1/track/3');
  });

  it('keeps a sub-path server prefix', () => {
    setMode('hosted');
    setServerUrl('https://example.com/abs');
    expect(absUrl('/api/me')).toBe('https://example.com/abs/api/me');
  });

  it('reads the stored server when hosted mode starts', () => {
    localStorage.setItem('storyshelf.server', 'https://abs.example.com');
    setMode('hosted');
    expect(absUrl('/status')).toBe('https://abs.example.com/status');
  });
});
