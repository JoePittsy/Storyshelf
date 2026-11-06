import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so tests do not need ABS_URL.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.{test,spec}.{ts,tsx}'] },
});
