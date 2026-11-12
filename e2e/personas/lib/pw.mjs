// Finds the workspace's Playwright (1.64.1, a dependency of apps/web) from anywhere under e2e/personas/.
//
// e2e/ has no package.json of its own, and a plain `import 'playwright'` would only resolve if a copy happened to sit
// above this folder. So resolve it the way Node would from apps/web: createRequire pointed at apps/web/package.json.
// `@playwright/test` is what apps/web depends on, and it re-exports chromium and devices.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const PERSONAS_DIR = resolve(import.meta.dirname, '..');
export const ROOT = resolve(PERSONAS_DIR, '../..');

const require = createRequire(resolve(ROOT, 'apps/web/package.json'));

let pw;
try {
  pw = require('@playwright/test');
} catch (e) {
  throw new Error(`Can't load Playwright from apps/web (${e.message}). Run \`pnpm install\` at the repo root first.`);
}

export const { chromium, devices } = pw;
