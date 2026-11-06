import { afterEach, describe, expect, it, vi } from 'vitest';
import { absFetch, login, resetAuthForTests } from './auth';

afterEach(() => {
  resetAuthForTests();
  vi.unstubAllGlobals();
});

async function signedIn(next: () => Response) {
  const calls: { url: string; auth: string | null }[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    if (url === '/login') {
      return Promise.resolve(new Response(JSON.stringify({ user: { id: 'u', username: 'j', accessToken: 'tok' } })));
    }
    calls.push({ url, auth: new Headers(init.headers).get('authorization') });
    return Promise.resolve(next());
  });
  await login('j', 'p');
  return calls;
}

describe('absFetch with bodies that are not JSON (ABS sync and close reply "OK")', () => {
  it('REQ-22: a 200 with the text "OK" resolves undefined and still sends the Bearer token', async () => {
    const calls = await signedIn(() => new Response('OK', { status: 200 }));
    await expect(absFetch('/api/session/s/sync', { method: 'POST' })).resolves.toBeUndefined();
    expect(calls[0]?.auth, 'Expected the Bearer token on the request').toBe('Bearer tok');
  });

  it('REQ-22: a 200 with an empty body resolves undefined', async () => {
    await signedIn(() => new Response('', { status: 200 }));
    await expect(absFetch('/api/x')).resolves.toBeUndefined();
  });

  it('REQ-22: a 204 resolves undefined', async () => {
    await signedIn(() => new Response(null, { status: 204 }));
    await expect(absFetch('/api/x')).resolves.toBeUndefined();
  });

  it('a JSON body is still parsed', async () => {
    await signedIn(() => new Response('{"a":1}', { status: 200 }));
    await expect(absFetch('/api/x')).resolves.toEqual({ a: 1 });
  });

  it('a non-2xx still rejects with its status', async () => {
    await signedIn(() => new Response('nope', { status: 500 }));
    await expect(absFetch('/api/x')).rejects.toMatchObject({ status: 500 });
  });
});
