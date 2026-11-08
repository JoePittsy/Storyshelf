// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, checkForUpdate, resetUpdatesForTests, useUpdateReady, watchForUpdates } from './updates';
import { act, renderHook } from '@testing-library/react';

type Listener = () => void;

/** A worker that installs when `finish` is called. */
function fakeWorker(state: ServiceWorkerState = 'installing') {
  const on = new Map<string, Listener[]>();
  const w = {
    state,
    postMessage: vi.fn(),
    addEventListener: (ev: string, cb: Listener) => on.set(ev, [...(on.get(ev) ?? []), cb]),
    finish(next: ServiceWorkerState = 'installed') {
      w.state = next;
      on.get('statechange')?.forEach((cb) => cb());
    },
  };
  return w;
}

function setup({ controller = true, waiting = false } = {}) {
  const regOn = new Map<string, Listener[]>();
  const reg = {
    waiting: waiting ? fakeWorker('installed') : null,
    installing: null as ReturnType<typeof fakeWorker> | null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: (ev: string, cb: Listener) => regOn.set(ev, [...(regOn.get(ev) ?? []), cb]),
    found(w: ReturnType<typeof fakeWorker>) {
      reg.installing = w;
      regOn.get('updatefound')?.forEach((cb) => cb());
    },
  };
  const containerOn = new Map<string, Listener>();
  const container = {
    controller: controller ? {} : null,
    addEventListener: (ev: string, cb: Listener) => containerOn.set(ev, cb),
  };
  watchForUpdates(reg as unknown as ServiceWorkerRegistration, container as unknown as ServiceWorkerContainer);
  return { reg, container, containerOn };
}

const reload = vi.fn();
beforeEach(() => vi.stubGlobal('location', { ...location, reload }));
afterEach(() => {
  resetUpdatesForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('updates', () => {
  it('says a release is ready once one finishes installing behind a running app', () => {
    const { reg } = setup();
    const ready = renderHook(() => useUpdateReady());
    expect(ready.result.current).toBe(false);
    const w = fakeWorker();
    reg.found(w);
    reg.waiting = w as never;
    act(() => w.finish());
    expect(ready.result.current).toBe(true);
  });

  it('notices a release already waiting when the app opens', () => {
    setup({ waiting: true });
    expect(renderHook(() => useUpdateReady()).result.current).toBe(true);
  });

  it("the first install isn't an update: nothing was running", () => {
    setup({ controller: false, waiting: true });
    expect(renderHook(() => useUpdateReady()).result.current).toBe(false);
  });

  it('checking asks the server, waits for a release it found to install, and says so', async () => {
    const { reg } = setup();
    const w = fakeWorker();
    reg.update.mockImplementation(() => {
      reg.installing = w;
      return Promise.resolve();
    });
    const result = checkForUpdate();
    await Promise.resolve();
    reg.waiting = w as never;
    w.finish();
    await expect(result).resolves.toBe('ready');
  });

  it('checking says up to date, or that it could not ask', async () => {
    const { reg } = setup();
    await expect(checkForUpdate()).resolves.toBe('current');
    reg.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(checkForUpdate()).resolves.toBe('failed');
  });

  it('Update tells the waiting release to take over, and reloads once it has', () => {
    const { reg, containerOn } = setup({ waiting: true });
    applyUpdate();
    expect(reg.waiting?.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    containerOn.get('controllerchange')?.();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('with no service worker, a check says so', async () => {
    await expect(checkForUpdate()).resolves.toBe('unsupported');
  });
});
