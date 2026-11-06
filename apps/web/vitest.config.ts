import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts so tests do not need ABS_URL.
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['@joepittsy/source'] },
  // jsdom screen tests take a few seconds each when the suite runs in parallel; the 5s default flakes.
  test: { environment: 'node', include: ['src/**/*.{test,spec}.{ts,tsx}'], testTimeout: 15_000 },
});
