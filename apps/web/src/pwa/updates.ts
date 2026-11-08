/**
 * New releases, asked about in the app. A release the service worker has installed waits (it never takes over by
 * itself, see serviceWorker.ts); this says when one is waiting, so the app can offer it, and moves to it on request.
 * The listener choosing Update is the only way a release reloads an open app. Without that, it still takes over at the
 * next launch.
 */
import { useSyncExternalStore } from 'react';
import { diag } from '../player/diag';

/** Written by the build next to the app (vite.config.ts), never kept by the worker: what the server has now. */
export const VERSION_URL = '/version.json';

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

/** The version the server is serving now; null when it can't be asked (offline) or doesn't say. */
async function serverVersion(): Promise<string | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * Whether there's a new release to offer. A waiting worker isn't enough on its own: iOS has been seen reporting one
 * when the server has nothing newer than what's running, and offering that is an Update that changes nothing, offered
 * again and again. So the server is asked which version it has. When it can't be (offline), the waiting worker is
 * trusted: it was installed from the server, after all.
 */
async function newReleaseWaiting(): Promise<boolean> {
  if (!waitingNow()) return false;
  const server = await serverVersion();
  const offer = server === null || server !== __APP_VERSION__;
  diag.log('update: a worker is waiting', { running: __APP_VERSION__, server, offer });
  // The worker may have moved on while the server was asked.
  return offer && waitingNow();
}

let checks = 0;
/** Works out readiness afresh; a check that's overtaken by a later one doesn't get the last word. */
async function recheck(): Promise<boolean> {
  const mine = ++checks;
  const next = await newReleaseWaiting();
  if (mine === checks) setReady(next);
  return next;
}

/** Called once the worker is registered: notices a release waiting now, and one that finishes installing later. */
export function watchForUpdates(reg: ServiceWorkerRegistration, c: ServiceWorkerContainer): void {
  registration = reg;
  container = c;
  void recheck();
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') void recheck();
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
  return (await recheck()) ? 'ready' : 'current';
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
  checks = 0;
  listeners.clear();
}
