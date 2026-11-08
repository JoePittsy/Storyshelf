// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, checkForUpdate, resetUpdatesForTests, useUpdateReady, watchForUpdates } from './updates';
import { act, renderHook, waitFor } from '@testing-library/react';

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
/** The version the server says it has (vitest.config.ts builds the running app as 9.9.9); null: it can't be reached. */
let onServer: string | null = '10.0.0';
const fetchVersion = vi.fn(() =>
  onServer === null
    ? Promise.reject(new TypeError('Failed to fetch'))
    : Promise.resolve(new Response(JSON.stringify({ version: onServer, commit: 'def5678' })))
);
beforeEach(() => {
  onServer = '10.0.0';
  vi.stubGlobal('location', { ...location, reload });
  vi.stubGlobal('fetch', fetchVersion);
});
afterEach(() => {
  resetUpdatesForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('updates', () => {
  it('says a release is ready once one finishes installing behind a running app', async () => {
    const { reg } = setup();
    const ready = renderHook(() => useUpdateReady());
    expect(ready.result.current).toBe(false);
    const w = fakeWorker();
    reg.found(w);
    reg.waiting = w as never;
    act(() => w.finish());
    await waitFor(() => expect(ready.result.current).toBe(true));
    expect(fetchVersion).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
  });

  it('notices a release already waiting when the app opens', async () => {
    setup({ waiting: true });
    const ready = renderHook(() => useUpdateReady());
    await waitFor(() => expect(ready.result.current).toBe(true));
  });

  it("a worker waiting with the version that's already running isn't offered", async () => {
    onServer = '9.9.9';
    const { reg } = setup({ waiting: true });
    const ready = renderHook(() => useUpdateReady());
    await waitFor(() => expect(fetchVersion).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(ready.result.current).toBe(false);
    reg.update.mockResolvedValue(undefined);
    await expect(checkForUpdate()).resolves.toBe('current');
  });

  it("offline, a waiting worker is trusted: the server can't be asked", async () => {
    onServer = null;
    setup({ waiting: true });
    const ready = renderHook(() => useUpdateReady());
    await waitFor(() => expect(ready.result.current).toBe(true));
  });

  it("the first install isn't an update: nothing was running", async () => {
    setup({ controller: false, waiting: true });
    const ready = renderHook(() => useUpdateReady());
    await act(() => Promise.resolve());
    expect(ready.result.current).toBe(false);
    expect(fetchVersion).not.toHaveBeenCalled();
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
