/**
 * The paths ABS itself answers. In same-origin mode they share the app's origin: the dev server and nginx forward them
 * to ABS, and the service worker must leave them alone (never the app shell in their place, never a cached copy).
 * Anchored like the nginx template, so our own routes that merely start with these words (e.g. /authors) stay in the SPA.
 *
 * vite.config.ts imports this too, so it must stay free of browser code.
 */
export const ABS_PATHS = '^/(api|login|logout|auth|status|public)(/|\\?|$)';

/**
 * Navigations the service worker must not answer with the app shell. Workbox tests each one against a URL's path and
 * query ("/api/me?x=1").
 */
export const navigateFallbackDenylist = (): RegExp[] => [new RegExp(ABS_PATHS)];
