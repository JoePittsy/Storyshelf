/**
 * Whether the app can reach its ABS server right now: one app-wide signal for the Offline indicator, the screens and
 * the player.
 *
 * Offline means a request to the server just failed for network reasons, or the browser says it has no network. The
 * browser alone is not trusted (iOS reports both wrongly at times), so any answer from the server counts as online
 * whatever it says, and while offline the server is asked again now and then: at once when the browser reports a
 * network or the app comes back to the screen, and otherwise after a growing wait.
 */
import { useSyncExternalStore } from 'react';

/** A request failed and the server could not be reached. */
let unreachable = false;
/** The browser's `offline` event, or navigator.onLine false at start. */
let browserOffline = false;
let offline = false;

const listeners = new Set<() => void>();

export const isOffline = (): boolean => offline;

export function subscribeConnectivity(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** True while the app is offline. */
export const useOffline = (): boolean => useSyncExternalStore(subscribeConnectivity, isOffline, () => false);

function update(): void {
  const next = unreachable || browserOffline;
  if (next === offline) return;
  offline = next;
  if (offline) schedule();
  else {
    clearTimeout(timer);
    attempt = 0;
  }
  listeners.forEach((cb) => cb());
}

/** A request failed for network reasons (see `isNetworkError`). */
export function markUnreachable(): void {
  unreachable = true;
  update();
}

/** The server answered: the app is online, whatever the browser says. */
export function markReachable(): void {
  unreachable = false;
  browserOffline = false;
  update();
}

// Gateway answers: nginx or the Vite proxy is up, but ABS behind it isn't. To the listener that is the same as offline.
const GATEWAY = new Set([502, 503, 504]);

/**
 * A failure that means the server couldn't be reached, as opposed to one it answered: fetch's TypeError (no network,
 * DNS, a dropped connection), a timeout, or a proxy saying ABS is down. A deliberate abort is not one.
 */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof DOMException) return e.name === 'TimeoutError' || e.name === 'NetworkError';
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && GATEWAY.has(status);
}

// --- asking again ---------------------------------------------------------------------------

/** Waits between checks while offline: quick at first, then once a minute. */
export const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000];

let probe: (() => Promise<unknown>) | null = null;
let checking: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;

function schedule(): void {
  clearTimeout(timer);
  if (!offline || !probe) return;
  const wait = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  attempt++;
  timer = setTimeout(() => void checkConnection(), wait);
}

/**
 * Asks the server now, once at a time. Any answer means online (a 401 from it is the probe's to handle); a network
 * failure keeps the app offline and waits longer before the next try.
 */
export function checkConnection(): Promise<void> {
  if (!probe) return Promise.resolve();
  const run = probe;
  checking ??= run()
    .then(
      () => markReachable(),
      (e: unknown) => {
        if (!isNetworkError(e)) return markReachable();
        markUnreachable();
        schedule();
      }
    )
    .finally(() => {
      checking = null;
    });
  return checking;
}

/**
 * Starts watching: the browser's online and offline events, the app coming back to the screen, and the timed checks.
 * `check` asks the server something small (in the app, renewing the session). Returns the stop.
 */
export function startConnectivity(check: () => Promise<unknown>): () => void {
  probe = check;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    browserOffline = true;
    update();
  }
  const onOffline = () => {
    browserOffline = true;
    update();
  };
  const onOnline = () => {
    browserOffline = false;
    attempt = 0;
    update();
    // The browser says there's a network again; the server decides.
    void checkConnection();
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible' || !offline) return;
    attempt = 0;
    void checkConnection();
  };
  addEventListener('offline', onOffline);
  addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    removeEventListener('offline', onOffline);
    removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(timer);
    probe = null;
  };
}

export function resetConnectivityForTests(): void {
  clearTimeout(timer);
  unreachable = false;
  browserOffline = false;
  offline = false;
  probe = null;
  checking = null;
  attempt = 0;
  listeners.clear();
}
