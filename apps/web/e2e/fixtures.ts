import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { resetUser, type Seed } from './abs';
import { loadEnv, type E2EEnv } from './env';

export { expect };
export type { Seed };

export const env: E2EEnv = loadEnv();

/**
 * Every test starts from the same listening state, whatever the last run (or the last test) left on the server:
 * see resetUser in abs.ts. Browser state is already fresh, as Playwright gives each test its own context.
 */
export const test = base.extend<{ seed: Seed }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright needs a destructured first argument
  seed: async ({}, use) => {
    await use(await resetUser(env));
  },
});

/** Signs in through the app's own form and waits for the library. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel('Username').fill(env.username);
  await page.getByLabel('Password').fill(env.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeAttached();
}

/** The player's progress slider, in whichever layout is showing. */
export const progressSlider = (page: Page, title: string): Locator =>
  page.getByRole('slider', { name: `Progress through ${title}` });

/** Seconds into the book from "1:02:03 of 14:00:00, Chapter 1: …" (the default whole-book window). */
export function secondsOf(valueText: string | null): number {
  const m = /^(\d+(?::\d{1,2}){1,2}) of /.exec(valueText ?? '');
  if (!m) return NaN;
  return m[1].split(':').reduce((t, part) => t * 60 + Number(part), 0);
}

/** The book position the slider reports now. NaN until it has one. */
export async function positionOf(slider: Locator): Promise<number> {
  return secondsOf(await slider.getAttribute('aria-valuetext'));
}

/** A string as a regular expression that matches it exactly. */
export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
