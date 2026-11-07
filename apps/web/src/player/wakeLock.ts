import { useEffect } from 'react';

/** The slice of a `WakeLockSentinel` used here. */
interface Sentinel {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

/** What the lock needs from the browser; `browserEnv` is the real one, and tests pass a fake. */
export interface WakeLockEnv {
  /** `navigator.wakeLock`, or undefined where the browser has none. */
  wakeLock: { request(type: 'screen'): Promise<Sentinel> } | undefined;
  visibility(): DocumentVisibilityState;
  /** Subscribes to visibility changes; returns the unsubscribe. */
  onVisibilityChange(cb: () => void): () => void;
}

export const browserEnv = (): WakeLockEnv => ({
  wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator ? navigator.wakeLock : undefined,
  visibility: () => document.visibilityState,
  onVisibilityChange: (cb) => {
    document.addEventListener('visibilitychange', cb);
    return () => document.removeEventListener('visibilitychange', cb);
  },
});

/**
 * Keeps the screen on while started. The browser drops a screen lock whenever the page is hidden (another app, the
 * phone locked), so it is asked for again each time the page comes back into view. Where there is no wake lock, or the
 * browser refuses one (low battery, a permissions policy), it does nothing and says nothing: the screen just sleeps
 * as usual.
 */
export function screenWakeLock(env: WakeLockEnv) {
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let asking = false;
  let unsubscribe: (() => void) | null = null;

  async function acquire(): Promise<void> {
    if (!wanted || sentinel || asking || !env.wakeLock || env.visibility() !== 'visible') return;
    asking = true;
    try {
      const s = await env.wakeLock.request('screen');
      if (!wanted) {
        await s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
      });
    } catch {
      // Refused: the screen sleeps as it normally would.
    } finally {
      asking = false;
    }
  }

  const onVisible = () => {
    if (env.visibility() === 'visible') void acquire();
  };

  return {
    start(): Promise<void> {
      wanted = true;
      unsubscribe ??= env.onVisibilityChange(onVisible);
      return acquire();
    },
    async stop(): Promise<void> {
      wanted = false;
      unsubscribe?.();
      unsubscribe = null;
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) await s.release().catch(() => {});
    },
    held: () => sentinel !== null && !sentinel.released,
  };
}

/** Keeps the screen on for as long as the calling component is mounted. */
export function useScreenWakeLock(): void {
  useEffect(() => {
    const lock = screenWakeLock(browserEnv());
    void lock.start();
    return () => void lock.stop();
  }, []);
}
