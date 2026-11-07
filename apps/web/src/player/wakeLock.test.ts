import { describe, expect, it, vi } from 'vitest';
import { screenWakeLock, type WakeLockEnv } from './wakeLock';

/** A fake `navigator.wakeLock` and `document`: sentinels that can be released by the "browser" (the page hiding). */
function fakeEnv({ supported = true, refuse = false } = {}) {
  let visibility: DocumentVisibilityState = 'visible';
  const docListeners = new Set<() => void>();
  const held: FakeSentinel[] = [];
  const request = vi.fn(async (type: 'screen') => {
    expect(type).toBe('screen');
    if (refuse) throw new DOMException('Not allowed', 'NotAllowedError');
    const s = new FakeSentinel();
    held.push(s);
    return s;
  });
  const env: WakeLockEnv = {
    wakeLock: supported ? { request } : undefined,
    visibility: () => visibility,
    onVisibilityChange: (cb) => {
      docListeners.add(cb);
      return () => docListeners.delete(cb);
    },
  };
  return {
    env,
    request,
    held,
    listeners: docListeners,
    /** The page hides: the browser lets go of every lock, then the page shows again. */
    hide() {
      visibility = 'hidden';
      held.forEach((s) => s.browserRelease());
      docListeners.forEach((cb) => cb());
    },
    show() {
      visibility = 'visible';
      docListeners.forEach((cb) => cb());
    },
  };
}

class FakeSentinel {
  released = false;
  private listeners = new Set<() => void>();
  addEventListener(_: 'release', cb: () => void) {
    this.listeners.add(cb);
  }
  release = vi.fn(async () => this.browserRelease());
  browserRelease() {
    if (this.released) return;
    this.released = true;
    this.listeners.forEach((cb) => cb());
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('screenWakeLock', () => {
  it('takes a screen lock when started', async () => {
    const f = fakeEnv();
    const lock = screenWakeLock(f.env);
    await lock.start();
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(lock.held()).toBe(true);
  });

  it('lets go of it when stopped, and stops listening', async () => {
    const f = fakeEnv();
    const lock = screenWakeLock(f.env);
    await lock.start();
    await lock.stop();
    expect(f.held[0]?.release).toHaveBeenCalled();
    expect(lock.held()).toBe(false);
    expect(f.listeners.size).toBe(0);
  });

  it('takes it again when the page comes back into view, as the browser drops it on hiding', async () => {
    const f = fakeEnv();
    const lock = screenWakeLock(f.env);
    await lock.start();
    f.hide();
    expect(lock.held()).toBe(false);
    expect(f.request).toHaveBeenCalledTimes(1); // not while hidden
    f.show();
    await flush();
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(lock.held()).toBe(true);
  });

  it('does not ask twice while it already holds one', async () => {
    const f = fakeEnv();
    const lock = screenWakeLock(f.env);
    await lock.start();
    f.show();
    await flush();
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it('does not take it back after being stopped', async () => {
    const f = fakeEnv();
    const lock = screenWakeLock(f.env);
    await lock.start();
    await lock.stop();
    f.hide();
    f.show();
    await flush();
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it('lets go at once of a lock that arrives after it was stopped', async () => {
    const f = fakeEnv();
    const lock = screenWakeLock(f.env);
    const starting = lock.start();
    await lock.stop();
    await starting;
    await flush();
    expect(f.held[0]?.release).toHaveBeenCalled();
    expect(lock.held()).toBe(false);
  });

  it('does nothing, quietly, where the browser has no wake lock', async () => {
    const f = fakeEnv({ supported: false });
    const lock = screenWakeLock(f.env);
    await expect(lock.start()).resolves.toBeUndefined();
    expect(lock.held()).toBe(false);
    await expect(lock.stop()).resolves.toBeUndefined();
  });

  it('swallows a refusal (low battery, a hidden page, a permissions policy)', async () => {
    const f = fakeEnv({ refuse: true });
    const lock = screenWakeLock(f.env);
    await expect(lock.start()).resolves.toBeUndefined();
    expect(lock.held()).toBe(false);
  });

  it('waits for the page to be visible before asking', async () => {
    const f = fakeEnv();
    f.hide();
    const lock = screenWakeLock(f.env);
    await lock.start();
    expect(f.request).not.toHaveBeenCalled();
    f.show();
    await flush();
    expect(f.request).toHaveBeenCalledTimes(1);
  });
});
