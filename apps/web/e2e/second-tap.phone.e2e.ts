import { env, expect, signIn, test } from './fixtures';
import { hasProgress } from './abs';

// Phone project only (see playwright.config.ts): a second tap on the same spot, a moment after the first, is what a
// listener's thumb does when nothing seems to have happened yet.
test('a second tap on a Recently added tile does not start another book', async ({ page, seed }) => {
  await signIn(page);

  const shelf = page.getByRole('heading', { name: 'Recently added', level: 2 }).locator('xpath=../..');
  const play = shelf.getByRole('button', { name: /^Play / }).first();
  await expect(play).toBeVisible();
  await play.scrollIntoViewIfNeeded();
  // Settle: the shelf is where it will be, so the point is the same for both taps.
  const label = (await play.getAttribute('aria-label')) ?? '';
  const first = label.replace(/^Play /, '');
  const box = await play.boundingBox();
  if (!box) throw new Error('The play button has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(300); // the listener's thumb, not an assertion
  await page.touchscreen.tap(x, y);

  const mini = page.getByRole('region', { name: 'Now playing' });
  await expect(mini).toBeVisible();
  // The first book is the one that plays...
  await expect(mini.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(mini).toContainText(first);
  // ...and the second tap opened nothing else: no other unstarted book has a listening record.
  const others = seed.unstarted.filter((b) => b.title !== first);
  for (const b of others) expect(await hasProgress(env, b.id), `${b.title} was started`).toBe(false);
  await expect(mini).toContainText(first);
});
