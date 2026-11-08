/**
 * Registering the service worker, and how a release takes over: apps/web/src/pwa/serviceWorker.ts
 * A new release waits, and takes over at launch (one reload before anything renders), never in an open app. In
 * development no worker is registered, and any left over is removed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SW_URL, startServiceWorker } from './serviceWorker';

type Listener = () => void;

function fakeContainer(opts: { waiting?: boolean; controller?: boolean; takesOver?: boolean } = {}) {
  const listeners = new Map<string, Listener>();
  const waiting = {
    postMessage: vi.fn((msg: { type: string }) => {
      if (msg.type === 'SKIP_WAITING' && opts.takesOver !== false)
        queueMicrotask(() => listeners.get('controllerchange')?.());
    }),
  };
  const reg = { waiting: opts.waiting ? waiting : null, update: vi.fn(() => Promise.resolve()) };
  const leftover = { unregister: vi.fn(() => Promise.resolve(true)) };
  const container = {
    controller: opts.controller ? {} : null,
    getRegistration: vi.fn(() => Promise.resolve(opts.waiting === undefined ? undefined : reg)),
    getRegistrations: vi.fn(() => Promise.resolve([leftover])),
    register: vi.fn(() => Promise.resolve(reg)),
    addEventListener: vi.fn((type: string, cb: Listener) => void listeners.set(type, cb)),
    removeEventListener: vi.fn((type: string) => void listeners.delete(type)),
  };
  return { container: container as unknown as ServiceWorkerContainer, raw: container, waiting, reg, leftover };
}

let reload: ReturnType<typeof vi.fn>;
let docListeners: Map<string, Listener>;

beforeEach(() => {
  reload = vi.fn();
  docListeners = new Map();
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (type: string, cb: Listener) => void docListeners.set(type, cb),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('startServiceWorker', () => {
  it('registers the worker for the whole app, without waiting on it to open', async () => {
    const { container, raw } = fakeContainer();
    await expect(startServiceWorker(container, true)).resolves.toBe(false);
    expect(raw.register).toHaveBeenCalledWith(SW_URL, { scope: '/' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('a release waiting from last time takes over at launch: one reload, before rendering', async () => {
    const { container, waiting } = fakeContainer({ waiting: true, controller: true });
    await expect(startServiceWorker(container, true)).resolves.toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("carries on with the old one if the new one doesn't take over in time", async () => {
    vi.useFakeTimers();
    const { container } = fakeContainer({ waiting: true, controller: true, takesOver: false });
    const started = startServiceWorker(container, true);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(started).resolves.toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('the first install needs no reload: nothing controls the page yet', async () => {
    const { container, waiting } = fakeContainer({ waiting: true, controller: false });
    await expect(startServiceWorker(container, true)).resolves.toBe(false);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('an open app looks for a release when it comes back to the screen, and leaves it waiting', async () => {
    const { container, reg, waiting } = fakeContainer({ waiting: false, controller: true });
    await startServiceWorker(container, true);
    await Promise.resolve();
    docListeners.get('visibilitychange')?.();
    expect(reg.update).toHaveBeenCalledTimes(1);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('development registers nothing and removes a worker left by a production build', async () => {
    const { container, raw, leftover } = fakeContainer();
    await expect(startServiceWorker(container, false)).resolves.toBe(false);
    expect(raw.register).not.toHaveBeenCalled();
    expect(leftover.unregister).toHaveBeenCalled();
  });

  it('does nothing where there are no service workers', async () => {
    await expect(startServiceWorker(undefined, true)).resolves.toBe(false);
  });

  it('a failing registration leaves the app working online', async () => {
    const { container, raw } = fakeContainer();
    raw.register.mockImplementation(() => Promise.reject(new Error('SecurityError')));
    await expect(startServiceWorker(container, true)).resolves.toBe(false);
  });
});
