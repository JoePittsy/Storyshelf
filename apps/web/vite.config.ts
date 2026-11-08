import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ABS_PATHS, navigateFallbackDenylist } from './src/api/absPaths';
import { inlineScriptHashes, optOutOfRocketLoader } from './src/pwa/builtPage';

// Settings > About shows these. The version is package.json's (the release workflow checks the tag matches it). The
// commit comes from Cloudflare Pages or GitHub Actions, else local git; a Docker build has neither, and shows none.
const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string })
  .version;
function commit(): string {
  const sha = process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// Hosted mode's Content-Security-Policy (public/_headers) allows scripts from this origin only. index.html's inline
// start-up probe is allowed by its hash, worked out here from the built page so the two can never drift.
const allowInlineScripts: Plugin = {
  name: 'storyshelf:allow-inline-scripts',
  apply: 'build',
  closeBundle() {
    const dist = resolve(import.meta.dirname, 'dist');
    const hashes = inlineScriptHashes(readFileSync(resolve(dist, 'index.html'), 'utf8'));
    if (hashes.length === 0) throw new Error('dist/index.html: expected an inline start-up script');
    const headersPath = resolve(dist, '_headers');
    const headers = readFileSync(headersPath, 'utf8');
    if (!headers.includes("script-src 'self';")) throw new Error("public/_headers: expected script-src 'self';");
    writeFileSync(headersPath, headers.replace("script-src 'self';", `script-src 'self' ${hashes.join(' ')};`));
  },
};

// /version.json: what this build is, for the app to ask the server whether a waiting worker is really a new release
// (src/pwa/updates.ts). Not kept by the worker (its globPatterns leave out .json), so the answer is always the server's.
const versionFile: Plugin = {
  name: 'storyshelf:version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, commit: commit() }) });
  },
};

const leftAloneByRocketLoader: Plugin = {
  name: 'storyshelf:left-alone-by-rocket-loader',
  apply: 'build',
  // After Vite has added its own script tags.
  transformIndexHtml: { order: 'post', handler: optOutOfRocketLoader },
};

// The service worker: the app shell kept on the device, so the installed app opens offline. How a new release takes
// over is in src/pwa/serviceWorker.ts.
const pwa = VitePWA({
  // The worker never skips waiting by itself; src/pwa/serviceWorker.ts registers it and moves a release in at launch.
  registerType: 'prompt',
  injectRegister: false,
  // public/manifest.webmanifest (and each icon colour's) stays the manifest.
  manifest: false,
  workbox: {
    // The built app: page, scripts, styles, fonts, the root icons and the manifests. Not the per-colour icon PNGs
    // (public/book/<colour>/), which are only read when installing and would add every colour to every device.
    globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
    globIgnores: ['book/**/*.png'],
    navigateFallback: '/index.html',
    // ABS's own paths are never answered with the app (same-origin mode). Nothing else is routed, so every request to
    // ABS, in either mode, goes to the network untouched and nothing it sends is cached here.
    navigateFallbackDenylist: navigateFallbackDenylist(),
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
  },
  // Never in development: the dev server serves fresh modules and must not be answered by a worker.
  devOptions: { enabled: false },
});

// The dev server answers /sw.js with a worker that removes itself: one left on this address by a production build
// (served here once, or on the same port) is replaced at the browser's next check, and the page reloads onto the dev
// server. The app itself registers no worker in development (src/pwa/serviceWorker.ts).
const SELF_REMOVING_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()
  .then(() => self.clients.matchAll({ type: 'window' }))
  .then((all) => all.forEach((c) => c.navigate(c.url)))));`;
const devRemovesWorker: Plugin = {
  name: 'storyshelf:dev-removes-worker',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/sw.js', (_req, res) => {
      res.setHeader('content-type', 'text/javascript');
      res.setHeader('cache-control', 'no-cache');
      res.end(SELF_REMOVING_SW);
    });
  },
};

export default defineConfig(({ command, mode }) => {
  const common = {
    plugins: [react(), versionFile, leftAloneByRocketLoader, pwa, devRemovesWorker, allowInlineScripts],
    resolve: { conditions: ['@joepittsy/source'] },
    define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit()) },
  };
  if (command === 'build') return common;
  const target = loadEnv(mode, process.cwd(), '').ABS_URL;
  if (!target) throw new Error('ABS_URL is not set. Put ABS_URL=https://your-abs-host in apps/web/.env.local');
  return {
    ...common,
    server: {
      // Phone testing over HTTPS via `tailscale serve --bg 5173` (https://<machine>.<tailnet>.ts.net).
      allowedHosts: ['.ts.net'],
      proxy: { [ABS_PATHS]: { target, changeOrigin: true } },
    },
  };
});
