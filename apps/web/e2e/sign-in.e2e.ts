import { env, escapeRe, expect, test } from './fixtures';

test('sign in: a wrong password is refused, the right one lands on the library with the resume hero', async ({
  page,
  seed,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel('Username').fill(env.username);
  await page.getByLabel('Password').fill(`${env.password}-wrong`);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Wrong username or password.' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByLabel('Password').fill(env.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeAttached();
  await expect(page).not.toHaveURL(/\/sign-in/);
  // The hero's action reads "Resume · 13h 58m left: <title>".
  await expect(
    page.getByRole('button', { name: new RegExp(`^Resume.*: ${escapeRe(seed.hero.title)}$`) })
  ).toBeVisible();
});
