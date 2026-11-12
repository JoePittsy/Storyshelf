// A browser session for one persona on one device, with its state kept on disk between runs.
//
// Why a persistent profile: the app keeps real things per device (each book's speed, downloads, the restored player,
// the progress-bar mode, the service worker). A throwaway browser per script makes all of that look "lost", and last
// time that was reported as bugs. `launchPersistentContext` keeps it the way a person's own browser would; `fresh: true`
// is the honest way to say "a new device" and wipes the profile first.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERSONAS_DIR, chromium, devices } from './pw.mjs';
import { accountFor, appUrl, loadEnv, passwordFor } from './env.mjs';
import { registerOut } from './probes.mjs';

export { snapshot, position, tapTargets, shot, contrast } from './probes.mjs';

/** Where profiles live (gitignored). One folder per persona and device, so desktop and phone are separate "devices". */
export const PROFILES_DIR = resolve(PERSONAS_DIR, '.profiles');
/** Where run output goes (gitignored) unless PERSONA_OUT says otherwise. */
export const RUNS_DIR = resolve(PERSONAS_DIR, 'runs');

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false };

/** The iPhone 14 descriptor, forced onto Chromium: the descriptor says WebKit, which this machine doesn't have. */
function phoneOptions() {
  const rest = { ...devices['iPhone 14'] };
  delete rest.defaultBrowserType; // a launch option Playwright rejects for a persistent context
  return { ...rest, hasTouch: true, isMobile: true };
}

/** Console errors and page errors, minus the one the app is expected to produce: a 401 while signing in. */
const EXPECTED_ERROR = /status of 401\b/;

/**
 * Opens (or re-opens) a persona's browser.
 *
 * @param {object} o
 * @param {string} o.persona   name of the persona: picks the profile folder and, unless `account` says otherwise, the ABS account
 * @param {'desktop'|'phone'} [o.device]
 * @param {boolean} [o.fresh]  wipe this profile first: a brand-new device
 * @param {string}  [o.account] sign in as this ABS account (default: PERSONA_ACCOUNT, else the persona's name)
 * @param {string}  [o.label]  extra profile name, for a second throwaway browser for the same persona
 * @param {boolean} [o.signIn] sign in when the app shows the sign-in form (default true)
 * @param {string}  [o.out]    folder for screenshots (default: PERSONA_OUT, else runs/adhoc-<time>)
 * @returns {Promise<{context, page, errors, close, url, go, account, device, out}>}
 */
export async function openSession({ persona, device = 'desktop', fresh = false, account, label, signIn = true, out } = {}) {
  if (!persona) throw new Error('openSession needs a persona');
  if (device !== 'desktop' && device !== 'phone') throw new Error(`Unknown device "${device}" (desktop or phone)`);
  const who = (account || accountFor(persona)).toLowerCase();
  const dir = resolve(PROFILES_DIR, `${persona}-${device}${label ? `-${label}` : ''}`);
  // A profile that was signed in as someone else is wiped: its stored state belongs to another person.
  const marker = resolve(dir, '.account');
  const sameAccount = existsSync(marker) && readFileSync(marker, 'utf8') === who;
  if (fresh || (existsSync(dir) && !sameAccount)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(marker, who);

  const outDir = out || loadEnv().PERSONA_OUT || resolve(RUNS_DIR, `adhoc-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    executablePath: loadEnv().PLAYWRIGHT_CHROMIUM_PATH || undefined,
    // The audio plays without a tap in the page: the scripts press the app's own buttons.
    args: ['--autoplay-policy=no-user-gesture-required'],
    ...(device === 'phone' ? phoneOptions() : DESKTOP),
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'allow',
  });
  context.setDefaultTimeout(15_000);

  const errors = [];
  const watch = (page) => {
    registerOut(page, outDir);
    page.on('console', (m) => {
      if (m.type() === 'error' && !EXPECTED_ERROR.test(m.text())) errors.push({ kind: 'console', text: m.text(), url: page.url(), at: Date.now() });
    });
    page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: String(e?.message ?? e), url: page.url(), at: Date.now() }));
  };
  context.pages().forEach(watch);
  context.on('page', watch);
  const page = context.pages()[0] ?? (await context.newPage());

  const base = appUrl();
  const go = (path = '/') => page.goto(`${base}${path.startsWith('/') ? path : `/${path}`}`, { waitUntil: 'domcontentloaded' });
  const session = {
    context,
    page,
    errors,
    url: base,
    go,
    account: who,
    device,
    out: outDir,
    close: () => context.close().catch(() => undefined),
  };
  try {
    await go('/');
    if (signIn) await signInIfShown(page, who);
  } catch (e) {
    await session.close();
    throw e;
  }
  return session;
}

/**
 * Signs in through the real form, but only if the app is showing it: a persistent profile is normally still signed in.
 * The password is read from e2e/.env and goes into the field; it is never logged or put in an error.
 */
export async function signInIfShown(page, account) {
  const library = page.getByRole('heading', { name: 'Library', level: 1 });
  const form = page.getByRole('heading', { name: 'Sign in', level: 1 });
  await library.or(form).first().waitFor({ state: 'attached', timeout: 30_000 });
  if (!(await form.count())) return false;
  await page.getByLabel('Username').fill(account);
  await page.getByLabel('Password').fill(passwordFor(account));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const alert = page.getByRole('alert').filter({ hasText: /\S/ });
  await library.or(alert).first().waitFor({ state: 'attached', timeout: 30_000 });
  if (!(await library.count())) {
    throw new Error(`Sign-in as "${account}" was refused: "${(await alert.first().innerText()).trim()}". Re-copy e2e/.env if the passwords were rotated.`);
  }
  return true;
}
