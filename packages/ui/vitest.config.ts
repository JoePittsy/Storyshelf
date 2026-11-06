import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(import.meta.dirname),
  test: {
    // A fixed port: on Windows a random one can land in a reserved range (EACCES). Change it if it clashes.
    api: { port: 41315 },
    projects: [
      // The jsdom suite.
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          pool: 'threads',
          setupFiles: ['./src/test/setup.ts'],
          css: { modules: { classNameStrategy: 'non-scoped' } },
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      // Every story rendered in real Chromium, axe included; a story that throws or violates fails, named by its title.
      {
        extends: true,
        plugins: [storybookTest({ configDir: path.join(import.meta.dirname, '.storybook') })],
        test: {
          name: 'stories',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
