import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Everything ABS serves; the browser only ever talks to this origin.
const ABS_PATHS = ['/api', '/login', '/logout', '/auth', '/status', '/public'];

export default defineConfig(({ command, mode }) => {
  if (command === 'build') return { plugins: [react()] };
  const target = loadEnv(mode, process.cwd(), '').ABS_URL;
  if (!target) throw new Error('ABS_URL is not set. Put ABS_URL=https://your-abs-host in apps/web/.env.local');
  return {
    plugins: [react()],
    server: { proxy: Object.fromEntries(ABS_PATHS.map((p) => [p, { target, changeOrigin: true }])) },
  };
});
