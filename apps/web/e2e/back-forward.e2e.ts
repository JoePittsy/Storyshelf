import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

// Back and Forward around a filter chosen in the More filters sheet. In 0.4.8 an open sheet owned a history entry of its
// own (so Back would close it); the filter's page went on top of that entry, closing the sheet left it stranded, and
// Forward bounced off it: the filtered view could not be reached again. Overlays no longer touch history. This keeps it
// so: every press moves exactly one real page, in both directions.
const filtered = /[?&]abridged=1\b/;

// The desktop layout has the "More filters" sheet; a phone's single "Filters" button holds the same sheet and is covered
// by the unit test in screens/Library.test.tsx.
test.skip(({ isMobile }) => isMobile, 'the desktop project');

async function openFiltersAndChooseAbridged(page: Page) {
  await page.getByRole('button', { name: 'More filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'More filters' });
  await sheet.getByLabel('Abridged').selectOption({ label: 'Abridged only' });
  await expect(page).toHaveURL(filtered);
  return sheet;
}

/** The library with a page behind it, so Back from the library has somewhere real to go. */
async function libraryWithPageBehind(page: Page) {
  await signIn(page);
  await page.getByRole('link', { name: 'Authors' }).click();
  await expect(page).toHaveURL(/\/authors(\?|$)/);
  await page.getByRole('link', { name: 'Library' }).first().click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeAttached();
  await expect(page).not.toHaveURL(filtered);
}

for (const how of ['Escape', 'Done'] as const) {
  test(`Back undoes a filter chosen in the sheet and Forward applies it again, every time (closed with ${how})`, async ({
    page,
    seed,
  }) => {
    void seed;
    await libraryWithPageBehind(page);
    const sheet = await openFiltersAndChooseAbridged(page);
    if (how === 'Escape') await page.keyboard.press('Escape');
    else await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(filtered);

    for (let round = 0; round < 3; round++) {
      await page.goBack();
      await expect(page).not.toHaveURL(filtered);
      await expect(page.getByRole('list', { name: 'Active filters' })).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.goForward();
      await expect(page).toHaveURL(filtered);
      await expect(page.getByRole('list', { name: 'Active filters' })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    // Past the unfiltered view, one more Back leaves the library for the page before it.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/authors(\?|$)/);
  });
}

test('Back to the page before the library, then Forward twice, ends on the filtered view', async ({ page, seed }) => {
  void seed;
  await libraryWithPageBehind(page);
  await openFiltersAndChooseAbridged(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goBack();
  await expect(page).not.toHaveURL(filtered);
  await page.goBack();
  await expect(page).toHaveURL(/\/authors(\?|$)/);

  // The library coming back may put its remembered filter on the first entry; either way the second Forward is the
  // filtered view, and neither press does nothing.
  await page.goForward();
  await expect(page).not.toHaveURL(/\/authors(\?|$)/);
  await page.goForward();
  await expect(page).toHaveURL(filtered);
  await expect(page.getByRole('list', { name: 'Active filters' })).toBeVisible();
});
