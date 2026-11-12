import { defineConfig, devices } from '@playwright/test';
import { assertAbsUp, assertAppUp, externalBaseUrl, loadEnv } from './e2e/env';

// End-to-end smoke tests: the real app against the local Audiobookshelf from ./e2e/up.sh. By default the Vite dev
// server, started here; with E2E_BASE_URL set, an app that is already running (the production build from
// ./e2e/up.sh --app) and no dev server. See e2e/README.md ("End-to-end tests").
const { absUrl } = loadEnv();
await assertAbsUp(absUrl);

const PORT = 5185;
const external = externalBaseUrl();
if (external) await assertAppUp(external);
const baseURL = external ?? `http://localhost:${PORT}`;

// A browser Playwright can't find (a machine with a different Chromium installed) is pointed at with this.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: './test-results',
  // One ABS user is shared by every test, and listening progress is server state: nothing runs in parallel.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      executablePath,
      // The audio plays without a tap in the page: the tests press the app's own buttons, not a gesture it can count.
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/*.phone.e2e.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      // devices['iPhone 14'] is a WebKit device; the suite only has Chromium, so keep its screen, touch and user agent.
      use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `pnpm exec vite --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60_000,
        env: { ABS_URL: absUrl },
      },
});
