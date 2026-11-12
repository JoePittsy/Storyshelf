import { expect, signIn, test } from './fixtures';

test('sign out: back to the sign-in screen, and it stays there', async ({ page }) => {
  await signIn(page);

  await page.goto('/settings');
  await expect(page.getByText('Signed in as')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('dialog', { name: 'Sign out of Storyshelf?' }).getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});
