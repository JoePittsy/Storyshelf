// The real network and browser for the download manager.
import { absFetch, absResponse, hasAccessToken, onSessionRenewed } from '../api/auth';
import { isOffline, subscribeConnectivity } from '../api/connectivity';
import { rememberedUser, serverKey } from '../api/lastUser';
import { screenWakeLock, browserEnv as wakeLockEnv } from '../player/wakeLock';
import type { Env, Net } from './manager';
import { coverPath, fileDownloadPath, type ExpandedItem } from './plan';

export const absNet: Net = {
  item: (itemId) => absFetch<ExpandedItem>(`/api/items/${encodeURIComponent(itemId)}?expanded=1`),
  file: (itemId, ino, range, signal) => {
    const headers = new Headers();
    if (range) headers.set('range', range);
    // absResponse renews an expired token and asks again, so a download outlasts the hour a token lives.
    return absResponse(fileDownloadPath(itemId, ino), { headers, signal, cache: 'no-store' });
  },
  cover: async (itemId, signal) => {
    const res = await absResponse(coverPath(itemId), { signal });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    return res.blob();
  },
};

export function browserEnv(): Env {
  const lock = screenWakeLock(wakeLockEnv());
  return {
    // Online and signed in: at launch, a book left halfway waits for the session rather than meeting a 401.
    online: () => !isOffline() && hasAccessToken(),
    onOnline: (cb) => {
      let was = !isOffline();
      const offConnectivity = subscribeConnectivity(() => {
        const now = !isOffline();
        if (now && !was) cb();
        was = now;
      });
      const offRenewed = onSessionRenewed(() => cb());
      return () => {
        offConnectivity();
        offRenewed();
      };
    },
    visible: () => document.visibilityState === 'visible',
    onVisible: (cb) => {
      const on = () => {
        if (document.visibilityState === 'visible') cb();
      };
      document.addEventListener('visibilitychange', on);
      return () => document.removeEventListener('visibilitychange', on);
    },
    estimate: async () => (typeof navigator.storage?.estimate === 'function' ? navigator.storage.estimate() : null),
    persist: async () => (typeof navigator.storage?.persist === 'function' ? navigator.storage.persist() : false),
    user: () => rememberedUser(),
    server: serverKey,
    objectUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    keepAwake: (on) => void (on ? lock.start() : lock.stop()),
    now: () => Date.now(),
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'));
        const t = setTimeout(resolve, ms);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new DOMException('Stopped', 'AbortError'));
          },
          { once: true }
        );
      }),
  };
}

/** Whether the browser can keep downloads at all: OPFS and a worker (iOS 17 and up, current desktop browsers). */
export const downloadsSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.storage?.getDirectory === 'function' &&
  typeof Worker === 'function';
