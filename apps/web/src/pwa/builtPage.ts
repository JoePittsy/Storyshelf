// Build-time helpers for the built page (dist/index.html), used by vite.config.ts. Node only: not part of the app.
import { createHash } from 'node:crypto';

/** The CSP hash of each inline <script> in a built page, as script-src sources. */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`
  );
}

/**
 * Marks every <script> in a page with data-cfasync="false", which Cloudflare's Rocket Loader leaves alone. Rocket
 * Loader (a per-zone setting) rewrites each script so the browser skips it, and loads them later through its own
 * loader from /cdn-cgi/. That loader isn't part of the build, so the service worker never has it: offline, the page
 * the service worker kept would run no script at all. The hosted site was caught by exactly this.
 */
export function optOutOfRocketLoader(html: string): string {
  return html.replace(/<script\b(?![^>]*\bdata-cfasync=)/g, '<script data-cfasync="false"');
}
