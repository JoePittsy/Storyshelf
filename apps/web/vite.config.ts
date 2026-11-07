import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

// Everything ABS serves; the browser only ever talks to this origin. Anchored like the nginx
// template, so our own routes that merely start with these words (e.g. /authors) stay in the SPA.
const ABS_PATHS = '^/(api|login|logout|auth|status|public)(/|\\?|$)';

export default defineConfig(({ command, mode }) => {
  const common = {
    plugins: [react()],
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
