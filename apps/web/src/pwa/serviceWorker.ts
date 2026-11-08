/**
 * The service worker keeps the app itself on the device (the page, its scripts, styles, fonts and icons), so the
 * installed app opens with no network. It never answers ABS's own paths and keeps nothing ABS sends: see vite.config.ts.
 *
 * Updates take over at the next launch, or when the listener chooses Update in the app (updates.ts); never by themselves
 * while it is open. A worker that takes over an open page has to reload it to be of use, and a reload stops the book
 * playing, so the worker never skips waiting on its own (vite-plugin-pwa's 'prompt' mode). A new release installs in the
 * background and waits, and the app offers it. At launch,
 * before anything has rendered or started playing, a waiting worker is told to take over and the page reloads onto it,
 * once. The browser would also activate it once every window of the old one had closed, but an iOS home-screen app is
 * mostly suspended rather than closed, and one the system kills doesn't reliably get that chance, so launch is where it
 * happens. On a computer, a second window opening does the same; a window already open carries on undisturbed, since
 * the whole app is one script it has already loaded.
 */

import { watchForUpdates } from './updates';

/** Where the build writes the worker (vite-plugin-pwa's default). */
export const SW_URL = '/sw.js';

/** How long to wait for a waiting worker to take over before carrying on with the old one. */
const TAKEOVER_MS = 3000;

/**
 * Registers the worker in a production build; in development, removes any left by a production build served on the
 * same address, so the dev server is never answered by one. Resolves true when the page is reloading onto a new
 * release, and the caller should render nothing.
 */
export async function startServiceWorker(
  container: ServiceWorkerContainer | undefined = navigator.serviceWorker,
  production = import.meta.env.PROD
): Promise<boolean> {
  if (!container) return false;
  try {
    if (!production) {
      const all = await container.getRegistrations();
      await Promise.all(all.map((r) => r.unregister()));
      return false;
    }
    const existing = await container.getRegistration('/');
    if (existing?.waiting && container.controller && (await takeOver(existing.waiting, container))) {
      location.reload();
      return true;
    }
    // Not awaited: the first registration fetches the worker, and the app must not wait on the network to open.
    void container
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        // A release that installs is offered in the app (updates.ts); otherwise it takes over at the next launch.
        watchForUpdates(reg, container);
        // A home-screen app can stay open (suspended) for days: look for a release when it comes back to the screen.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  } catch {
    // No service worker here (a private window, storage blocked): the app works online as before.
  }
  return false;
}

/** Asks the waiting worker to take over. True once it controls the page; false if it doesn't in time. */
function takeOver(waiting: ServiceWorker, container: ServiceWorkerContainer): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      container.removeEventListener('controllerchange', done);
      resolve(false);
    }, TAKEOVER_MS);
    function done() {
      clearTimeout(timer);
      resolve(true);
    }
    container.addEventListener('controllerchange', done, { once: true });
    // vite-plugin-pwa's worker in 'prompt' mode skips waiting on this message.
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}
