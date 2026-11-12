import { escapeRe, expect, signIn, test } from './fixtures';

test('search finds books by narrator and offers the narrator as a chip', async ({ page, seed }) => {
  const { narrated } = seed;
  await signIn(page);

  await page.getByRole('searchbox', { name: 'Search books' }).fill(narrated.narrator);

  await expect(page.getByRole('heading', { name: /^Search results/ })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(escapeRe(narrated.title)) }).first()).toBeVisible();
  const chips = page.getByRole('list', { name: 'Matching authors, narrators and series' });
  // The chip's kind is read out ("Narrator: Dev Patel") rather than shown as a word.
  await expect(
    chips.getByRole('link', { name: new RegExp(`^Narrator: ${escapeRe(narrated.narrator)}`) })
  ).toBeVisible();
});
