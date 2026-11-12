import type { Page } from '@playwright/test';
import { expect, progressSlider, signIn, test } from './fixtures';

const timerButton = (page: Page) => page.getByRole('button', { name: /^Sleep timer/ });

/** Minutes and seconds left, from a button name like "Sleep timer, 14:52". NaN when no timer is armed. */
async function secondsLeft(page: Page): Promise<number> {
  const name = (await timerButton(page).getAttribute('aria-label')) ?? '';
  const m = /^Sleep timer, (\d+):(\d{2})$/.exec(name);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

async function set15Minutes(page: Page): Promise<void> {
  await timerButton(page).click();
  await page.getByRole('button', { name: '15 minutes' }).click();
}

test('sleep timer: set before pressing Play, it is still armed and counts down while playing', async ({
  page,
  seed,
}) => {
  await signIn(page);
  // A fresh load of the player: the book is restored and paused.
  await page.goto('/now-playing');
  const slider = progressSlider(page, seed.hero.title);
  await expect(slider).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  await set15Minutes(page);
  await expect(timerButton(page)).toHaveAccessibleName('Sleep timer, 15:00');

  // (An armed timer turns the progress bar to its sleep window, so Pause is what says the book is playing.)
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  // Still armed (the button names a time, not just "Sleep timer") and counting down.
  await expect(timerButton(page)).toHaveAccessibleName(/^Sleep timer, \d+:\d{2}$/);
  await expect.poll(() => secondsLeft(page)).toBeLessThan(15 * 60);
  expect(await secondsLeft(page)).toBeGreaterThan(14 * 60);
});

test('sleep timer: set while playing, it keeps counting down', async ({ page, seed }) => {
  await signIn(page);
  await page.goto('/now-playing');
  const slider = progressSlider(page, seed.hero.title);
  await expect(slider).toBeVisible();

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

  await set15Minutes(page);
  await expect(timerButton(page)).toHaveAccessibleName(/^Sleep timer, \d+:\d{2}$/);
  const first = await secondsLeft(page);
  expect(first).toBeLessThanOrEqual(15 * 60);
  await expect.poll(() => secondsLeft(page)).toBeLessThan(first);
  await expect(timerButton(page)).toHaveAccessibleName(/^Sleep timer, \d+:\d{2}$/);
});
