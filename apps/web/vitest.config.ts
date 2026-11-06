import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts so tests do not need ABS_URL.
export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ['@joepittsy/source'] },
  test: { environment: 'node', include: ['src/**/*.{test,spec}.{ts,tsx}'] },
});
