import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Everything ABS serves; the browser only ever talks to this origin. Anchored like the nginx
// template, so our own routes that merely start with these words (e.g. /authors) stay in the SPA.
const ABS_PATHS = '^/(api|login|logout|auth|status|public)(/|\\?|$)';

export default defineConfig(({ command, mode }) => {
  const common = { plugins: [react()], resolve: { conditions: ['@joepittsy/source'] } };
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
