/**
 * Tests for ABS's own paths: apps/web/src/api/absPaths.ts
 * The service worker must never answer these navigations with the app shell (same-origin mode), and must answer every
 * route of the app, including ones that merely start with the same words.
 */
import { describe, expect, it } from 'vitest';
import { ABS_PATHS, navigateFallbackDenylist } from './absPaths';

// Workbox's NavigationRoute tests each denylist pattern against the URL's path and query.
const denied = (pathAndQuery: string) => navigateFallbackDenylist().some((re) => re.test(pathAndQuery));

describe('navigateFallbackDenylist', () => {
  it.each([
    '/api',
    '/api/',
    '/api/libraries',
    '/api/items/li_1/cover?width=400',
    '/login',
    '/login?redirect=1',
    '/logout',
    '/auth/refresh',
    '/auth/openid/callback',
    '/status',
    '/status?x=1',
    '/public/session/abc/track/1',
  ])('leaves %s to ABS', (path) => {
    expect(denied(path)).toBe(true);
  });

  it.each([
    '/',
    '/?library=lib1',
    '/authors',
    '/author/a1',
    '/series',
    '/book/li_1',
    '/history/stats',
    '/settings',
    '/sign-in',
    '/apis',
    '/statuses',
    '/publications',
    '/logins',
  ])('answers %s with the app', (path) => {
    expect(denied(path)).toBe(false);
  });

  it('is the same pattern the dev server proxies', () => {
    expect(navigateFallbackDenylist().map((re) => re.source)).toEqual([new RegExp(ABS_PATHS).source]);
  });
});
