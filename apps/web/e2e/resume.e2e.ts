import { env, escapeRe, expect, positionOf, progressSlider, signIn, test } from './fixtures';
import { savedPosition } from './abs';

/**
 * The most the app goes back when playback resumes after a pause (src/player/rewind.ts: 5 s for a pause under five
 * minutes). It rewinds on Play, not on pause, so a reload after a pause shows the saved place as it is; the margin is
 * for the pause landing a moment after the position was read.
 */
const TOLERANCE_S = 6;

test('resume and keep my place: the position survives a reload and a brand-new browser', async ({
  page,
  browser,
  seed,
}, testInfo) => {
  const { hero } = seed;
  await signIn(page);

  await page.getByRole('button', { name: new RegExp(`^Resume.*: ${escapeRe(hero.title)}$`) }).click();
  // The mini player opens the full player. Wide, both its title and an Expand button do; on a phone, the title alone.
  await page
    .getByRole('region', { name: 'Now playing' })
    .getByRole('button', { name: /^(Open player|Expand player)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/now-playing$/);

  const slider = progressSlider(page, hero.title);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  // Real audio, real time: the position moves on from where it was left.
  await expect.poll(() => positionOf(slider)).toBeGreaterThan(seed.heroAt + 1);

  const before = await positionOf(slider);
  await page.getByRole('button', { name: 'Forward 30 seconds' }).click();
  await page.getByRole('button', { name: 'Forward 30 seconds' }).click();
  await expect.poll(() => positionOf(slider)).toBeGreaterThanOrEqual(before + 60);

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const paused = await positionOf(slider);
  expect(paused).toBeGreaterThanOrEqual(before + 60);

  // The pause sync reaches the server before anything else looks.
  await expect.poll(() => savedPosition(env, hero.id)).toBeGreaterThanOrEqual(paused - TOLERANCE_S);
  expect(Math.abs((await savedPosition(env, hero.id)) - paused)).toBeLessThanOrEqual(TOLERANCE_S);

  await page.reload();
  await expect(page).toHaveURL(/\/now-playing$/);
  await expect(slider).toBeVisible();
  await expect.poll(async () => Math.abs((await positionOf(slider)) - paused)).toBeLessThanOrEqual(TOLERANCE_S);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  // A different browser, with nothing of the first one: the server has the place.
  const { baseURL, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = testInfo.project.use;
  const other = await browser.newContext({ baseURL, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor });
  try {
    const page2 = await other.newPage();
    await signIn(page2);
    await page2.goto('/now-playing');
    const slider2 = progressSlider(page2, hero.title);
    await expect(slider2).toBeVisible();
    await expect.poll(async () => Math.abs((await positionOf(slider2)) - paused)).toBeLessThanOrEqual(TOLERANCE_S);
  } finally {
    await other.close();
  }
});
