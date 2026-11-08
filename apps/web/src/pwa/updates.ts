/**
 * New releases, asked about in the app. A release the service worker has installed waits (it never takes over by
 * itself, see serviceWorker.ts); this says when one is waiting, so the app can offer it, and moves to it on request.
 * The listener choosing Update is the only way a release reloads an open app. Without that, it still takes over at the
 * next launch.
 */
import { useSyncExternalStore } from 'react';

let registration: ServiceWorkerRegistration | null = null;
let container: ServiceWorkerContainer | null = null;
let ready = false;
const listeners = new Set<() => void>();

function setReady(next: boolean): void {
  if (ready === next) return;
  ready = next;
  listeners.forEach((cb) => cb());
}

/** A release is installed and waiting: there's an app running, so it isn't the first install. */
const waitingNow = (): boolean => !!registration?.waiting && !!container?.controller;

/** Called once the worker is registered: notices a release waiting now, and one that finishes installing later. */
export function watchForUpdates(reg: ServiceWorkerRegistration, c: ServiceWorkerContainer): void {
  registration = reg;
  container = c;
  setReady(waitingNow());
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') setReady(waitingNow());
    });
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const snapshot = () => ready;

/** True while a new release is waiting to be moved to. */
export const useUpdateReady = (): boolean => useSyncExternalStore(subscribe, snapshot, () => false);

/** How long a check waits for a release it found to finish installing. */
export const INSTALL_WAIT_MS = 30_000;

export type CheckResult = 'ready' | 'current' | 'failed' | 'unsupported';

/** Asks the server for a new release now. Resolves once any it found has installed: then 'ready'. */
export async function checkForUpdate(): Promise<CheckResult> {
  const reg = registration;
  if (!reg) return 'unsupported';
  try {
    await reg.update();
  } catch {
    return 'failed';
  }
  const installing = reg.installing;
  if (installing)
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, INSTALL_WAIT_MS);
      installing.addEventListener('statechange', () => {
        if (installing.state !== 'installing') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  const now = waitingNow();
  setReady(now);
  return now ? 'ready' : 'current';
}

/** Moves to the waiting release: it takes over, and the page reloads onto it once. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting || !container) return;
  container.addEventListener('controllerchange', () => location.reload(), { once: true });
  // vite-plugin-pwa's worker in 'prompt' mode skips waiting on this message.
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function resetUpdatesForTests(): void {
  registration = null;
  container = null;
  ready = false;
  listeners.clear();
}
