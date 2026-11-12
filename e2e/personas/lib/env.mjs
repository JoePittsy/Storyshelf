// Settings: e2e/.env (the same file the Playwright suite in apps/web/e2e reads), plus a few environment variables.
//
//   STORYSHELF_URL     the app under test            (default http://localhost:18080, the production build)
//   ABS_E2E_URL        Audiobookshelf itself         (from e2e/.env, default http://localhost:13378)
//   PERSONA_ACCOUNT    sign in as this ABS account instead of the persona's own (runs joe's tasks as dan)
//   PERSONA_OUT        output folder for screenshots and scorecards (default runs/adhoc-<time>)
//   PLAYWRIGHT_CHROMIUM_PATH  a Chromium that Playwright can't find by itself
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './pw.mjs';

const ENV_FILE = resolve(ROOT, 'e2e/.env');

/** KEY=VALUE lines, as init.sh writes them: one pair of quotes at most, no expansion. */
function parse(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** e2e/.env as an object, with real environment variables taking precedence. Never prints anything. */
export function loadEnv() {
  const file = existsSync(ENV_FILE) ? parse(readFileSync(ENV_FILE, 'utf8')) : {};
  return { ...file, ...process.env };
}

export const absUrl = () => (loadEnv().ABS_E2E_URL || 'http://localhost:13378').replace(/\/+$/, '');
export const appUrl = () => (loadEnv().STORYSHELF_URL || 'http://localhost:18080').replace(/\/+$/, '');

/** The ABS account a persona signs in as: PERSONA_ACCOUNT if set, else the persona's own name. */
export const accountFor = (persona) => (loadEnv().PERSONA_ACCOUNT || persona).toLowerCase();

/**
 * The account's password, or an error that names the missing key (never the value). Persona accounts use
 * ABS_E2E_PERSONA_<NAME>_PASSWORD; the two older accounts in e2e/.env (root and the ordinary e2e user) are found by
 * name too, so PERSONA_ACCOUNT=e2e-user works on a server that has no persona accounts yet.
 */
export function passwordFor(account) {
  const env = loadEnv();
  if (account === env.ABS_E2E_USER2 && env.ABS_E2E_PASSWORD2) return env.ABS_E2E_PASSWORD2;
  const key = `ABS_E2E_PERSONA_${account.toUpperCase()}_PASSWORD`;
  const value = env[key];
  if (!value) throw new Error(`No ${key} in e2e/.env. e2e/seed-personas.sh is what creates the persona accounts.`);
  return value;
}
