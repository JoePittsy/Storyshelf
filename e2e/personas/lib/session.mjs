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
 * @returns {Promise<{context, page, errors, close, url, go, account, device, out, build}>} `build` says which release
 *   the page is running and whether it is the server's current one (see `ensureCurrentBuild`)
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
  // A page load can be aborted by a navigation the app itself starts in the same moment (a redirect, a new release
  // taking over). A script loads pages faster than a person can, so it tries once more.
  const go = async (path = '/') => {
    const to = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await page.goto(to, { waitUntil: 'domcontentloaded' });
    } catch (e) {
      if (!/ERR_ABORTED/.test(String(e?.message))) throw e;
      await page.waitForTimeout(300);
      return page.goto(to, { waitUntil: 'domcontentloaded' });
    }
  };
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
    session.build = await ensureCurrentBuild(page, base, go);
    if (signIn) await signInIfShown(page, who);
  } catch (e) {
    await session.close();
    throw e;
  }
  return session;
}

const BUILD_SCRIPT = /assets\/(index-[\w-]+\.js)/;

/** The app's main script as the server has it now, read past any service worker. Null when it names none (the dev server). */
async function servedBuild(base) {
  try {
    const html = await (await fetch(`${base}/index.html`, { cache: 'no-store' })).text();
    return BUILD_SCRIPT.exec(html)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Makes sure the page runs the build the server has now. A persistent profile keeps the last release in its service
 * worker, and the app only moves to a new one at a launch after the new worker has installed, so the first run after a
 * rebuild would otherwise test the old release without saying so (a fixed bug then "reproduces", and a scorecard is
 * for the wrong code). Waiting for the app's own takeover is slow and can outlast a script, so an old release is
 * dropped here instead: the profile's worker and its kept files are removed and the page is loaded again from the
 * server, which registers the new worker. Everything else the device keeps (sign-in, places, downloads) stays.
 *
 * @returns {Promise<{served: string|null, running: string|null, current: boolean|null}>} `current` is null when the
 *   server's build can't be told (the dev server), false when the old release is still running after all that.
 */
async function ensureCurrentBuild(page, base, go) {
  const within = (ms, work) => Promise.race([work, new Promise((done) => setTimeout(() => done(undefined), ms))]);
  const running = () =>
    within(
      5000,
      page
        .evaluate((src) => [...document.scripts].map((el) => new RegExp(src).exec(el.src)?.[1]).find(Boolean) ?? null, BUILD_SCRIPT.source)
        .catch(() => null)
    ).then((v) => v ?? null);
  const served = await servedBuild(base);
  let now = await running();
  if (!served) return { served, running: now, current: null };
  for (let attempt = 0; attempt < 3 && now !== served; attempt++) {
    await within(
      10_000,
      page
        .evaluate(async () => {
          for (const reg of (await navigator.serviceWorker?.getRegistrations()) ?? []) await reg.unregister();
          for (const key of await caches.keys()) await caches.delete(key);
        })
        .catch(() => undefined)
    );
    await go('/').catch(() => undefined);
    await page.waitForTimeout(1500); // the app may reload once more as its new worker takes over
    now = await running();
  }
  return { served, running: now, current: now === served };
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
