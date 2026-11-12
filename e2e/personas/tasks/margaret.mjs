// Margaret: desktop, mouse only, new account, reads labels literally. Her server state is "no listening history at all"
// (e2e/seed-personas.sh); tasks that need that say so and skip when it isn't true, rather than fail on a used account.
import { defineTask, sleep } from '../lib/task.mjs';
import { openSession, position, tapTargets } from '../lib/session.mjs';
import { passwordFor } from '../lib/env.mjs';
import { escapeRe, goHome, libraryHeading, libraryReady, pauseButton, playButton } from '../lib/ui.mjs';

const noHistory = async (t) => (await t.abs.books()).every((b) => !b.progress);

/** The book she searches for: any book with chapters and a real length that she hasn't started. Chosen by property. */
async function bookToStart(t) {
  const books = (await t.abs.books()).filter((b) => !b.progress && b.chapters >= 4 && b.duration >= 3600);
  return books[0];
}

/** Removes the listening record (and bookmarks) a task made, so the account is new again for the next run. */
const forget = (t, book) => async () => {
  await t.abs.call('DELETE', `/api/me/progress/${(await t.abs.progressOf(book.id))?.id ?? book.id}`).catch(() => undefined);
  await t.abs.clearBookmarks(book.id).catch(() => undefined);
};

/** Home, then the book's link in All books, then the big button on its page: how she starts a book she has not started. */
async function startFromBookPage(t, book) {
  await goHome(t);
  await t.page.getByRole('list').getByRole('link', { name: new RegExp(`^${escapeRe(book.title)}\\b`) }).last().click();
  await t.page.waitForURL(/\/book\//, { timeout: 10_000 });
  const go = t.page.getByRole('button', { name: /^(Play|Resume)/ }).first();
  await go.waitFor({ state: 'visible', timeout: 10_000 });
  await go.click();
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 20_000 });
}

const wrongPassword = defineTask('margaret-wrong-password', 'Mistype the password once: she is told plainly, stays on the sign-in page, and the right one lets her in', async (t) => {
  // A separate profile with nothing in it: this is "the first visit", and the main profile stays signed in.
  const s = await openSession({ persona: t.persona, device: 'desktop', fresh: true, label: 'signin-check', signIn: false, account: t.account });
  try {
    const { page } = s;
    await page.getByRole('heading', { name: 'Sign in', level: 1 }).waitFor({ state: 'visible', timeout: 20_000 });
    t.step('type her name and a wrong password, press Sign in');
    await page.getByLabel('Username').fill(t.account);
    await page.getByLabel('Password').fill(`${passwordFor(t.account)}x`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Wrong username or password.' });
    const told = await t.see(alert, 10_000);
    const stayed = /\/sign-in$/.test(new URL(page.url()).pathname);
    t.step('retype the right password, press Sign in');
    await page.getByLabel('Password').fill(passwordFor(t.account));
    await page.getByRole('button', { name: 'Sign in' }).click();
    await libraryHeading(page).waitFor({ state: 'attached', timeout: 20_000 });
    return {
      pass: told && stayed,
      note: told ? 'Told "Wrong username or password.", stayed on /sign-in, then got in with the right one' : 'No "Wrong username or password." message appeared after a wrong password',
    };
  } finally {
    await s.close();
  }
});

const firstScreen = defineTask('margaret-first-screen', 'A new account sees no "Resume" for a book she never started, and every control has a name she can read', async (t) => {
  if (!(await noHistory(t))) return t.skip('margaret has listening history on the server, so this is no longer a new account (run e2e/seed-personas.sh --only margaret)');
  await goHome(t);
  const resume = await t.page.getByRole('button', { name: /^Resume/ }).count();
  const targets = (await tapTargets(t.page)).filter((x) => !x.disabled);
  const nameless = targets.filter((x) => !x.name.trim());
  return {
    pass: resume === 0 && nameless.length === 0,
    note: `${targets.length} controls on the first screen; ${resume} named Resume (want 0); ${nameless.length} with no readable name${nameless.length ? ': ' + nameless.map((x) => `${x.role} at ${x.x},${x.y}`).join('; ') : ''}`,
  };
});

const findAndStart = defineTask('margaret-find-and-start', 'Find a book by typing its title, open it and start it with the mouse only', async (t) => {
  const book = await bookToStart(t);
  if (!book) return t.skip('no unstarted book with chapters in the library');
  t.onDone(async () => {
    if (await pauseButton(t.page).isVisible().catch(() => false)) await pauseButton(t.page).click();
    await forget(t, book)();
  });
  await goHome(t);
  t.step('click the search box and type the title');
  await t.page.getByRole('searchbox', { name: 'Search your library' }).click();
  await t.page.keyboard.type(book.title, { delay: 60 });
  const result = t.page.getByRole('link', { name: new RegExp(`^${escapeRe(book.title)}\\b`) }).first();
  if (!(await t.see(result, 10_000))) return { pass: false, note: `Typing "${book.title}" showed no link to that book` };
  t.step('click the book');
  await result.click();
  await t.page.waitForURL(/\/book\//, { timeout: 10_000 });
  // The big button on a book she has not started: what does it say?
  const go = t.page.getByRole('button', { name: /^(Play|Resume)/ }).first();
  await go.waitFor({ state: 'visible', timeout: 10_000 });
  const label = ((await go.getAttribute('aria-label')) ?? (await go.innerText())).trim();
  t.step(`click "${label}"`);
  await go.click();
  const playing = await t.see(pauseButton(t.page), 20_000);
  const first = await position(t.page, { duration: book.duration });
  await sleep(4000);
  const later = await position(t.page, { duration: book.duration });
  return {
    pass: /^Play/.test(label) && playing && later - first >= 2,
    note: `Button on the unstarted book reads "${label}" (want it to say Play, not Resume); ${playing ? 'playing' : 'not playing'}; position ${first}s then ${later}s`,
  };
});

const comeBack = defineTask('margaret-come-back', 'Close the browser, open it again tomorrow in the same profile: Resume carries on at the same place', async (t) => {
  const book = await bookToStart(t);
  if (!book) return t.skip('no unstarted book with chapters in the library');
  t.onDone(async () => {
    if (await pauseButton(t.page).isVisible().catch(() => false)) await pauseButton(t.page).click();
    await forget(t, book)();
  });
  t.step('open the book and press Play');
  await startFromBookPage(t, book);
  await sleep(6000);
  t.step('pause');
  await pauseButton(t.page).click();
  await playButton(t.page).waitFor({ state: 'visible' });
  const paused = await position(t.page, { duration: book.duration });
  t.step('close the browser and open it again');
  const s = await t.reopen();
  await libraryReady(s.page);
  const resume = s.page.getByRole('button', { name: new RegExp(`^Resume.*: ${escapeRe(book.title)}$`) });
  if (!(await t.see(resume, 15_000))) return { pass: false, note: `After reopening, the library shows no "Resume … ${book.title}" button` };
  t.step('click Resume');
  await resume.click();
  await pauseButton(s.page).waitFor({ state: 'visible', timeout: 20_000 });
  const back = await position(s.page, { duration: book.duration });
  // Playing again rewinds a few seconds (at most 30 after a long pause), never forward.
  return {
    pass: back <= paused + 3 && back >= paused - 31,
    note: `Paused at ${paused}s; after reopening and Resume the position is ${back}s (a rewind of a few seconds is by design)`,
  };
});

const misclickChapter = defineTask('margaret-chapter-misclick', 'Click a chapter by mistake on the book page: she is told in words and can undo it', async (t) => {
  const book = await bookToStart(t);
  if (!book) return t.skip('no unstarted book with chapters in the library');
  t.onDone(forget(t, book));
  t.step('open the book and press Play, then pause');
  await startFromBookPage(t, book);
  await sleep(2000);
  await pauseButton(t.page).click();
  const here = await t.page.getByRole('progressbar', { name: `Progress through ${book.title}` }).getAttribute('aria-valuenow');
  t.step('click chapter 3 in the list');
  await t.page.getByRole('button', { name: /^Chapter 3\b/ }).first().click();
  const jumped = t.page.getByText(/Jumped to Chapter 3/).first();
  const undo = t.page.getByRole('button', { name: 'Undo', exact: true }).first();
  const told = await t.see(jumped, 5000);
  const canUndo = await t.see(undo, 3000);
  if (canUndo) {
    t.step('click Undo');
    await undo.click();
  }
  await sleep(600);
  return { pass: told && canUndo, note: `Message "Jumped to Chapter 3" ${told ? 'shown' : 'not shown'}; Undo ${canUndo ? 'offered and pressed' : 'not offered'} (progress was ${here}% before)` };
});

const signOut = defineTask('margaret-find-sign-out', 'Find Sign out from the little circle in the corner, and "Stay signed in" keeps her in', async (t) => {
  await goHome(t);
  t.step('click the circle with her initial');
  await t.page.getByRole('button', { name: /^Account:/ }).click();
  const item = t.page.getByRole('button', { name: 'Sign out', exact: true });
  if (!(await t.see(item, 5000))) return { pass: false, note: 'The account menu has no Sign out' };
  t.step('click Sign out, then Stay signed in');
  await item.click();
  const dialog = t.page.getByRole('dialog', { name: 'Sign out of Storyshelf?' });
  if (!(await t.see(dialog, 5000))) return { pass: false, note: 'Sign out did not ask her to confirm' };
  await dialog.getByRole('button', { name: 'Stay signed in' }).click();
  const stayed = await t.until(async () => (await dialog.count()) === 0, 5000);
  const still = !/sign-in/.test(t.page.url());
  t.step('click Sign out and confirm');
  await t.page.getByRole('button', { name: /^Account:/ }).click();
  await t.page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await t.page.getByRole('dialog', { name: 'Sign out of Storyshelf?' }).getByRole('button', { name: 'Sign out' }).click();
  await t.page.waitForURL(/\/sign-in$/, { timeout: 15_000 });
  // The profile is signed out now; the next run signs in through the form again, as she would.
  return { pass: stayed && still, note: 'Stay signed in closed the dialog and kept her signed in; Sign out then reached the sign-in page' };
});

export const tasks = [wrongPassword, firstScreen, findAndStart, comeBack, misclickChapter, signOut];

export const notCovered = [
  'her text-size and browser-zoom settings, and whether she can read the page at her usual size (only sam zooms, and only to measure)',
  'hovering over an icon to see its tooltip: names are read from the page, not from hover text',
  'hearing the book (silent stand-in audio, no audio output)',
  'how long she hesitates before pressing a button: only whether each control has a name she can read',
  'her husband sharing the laptop: only that Sign out exists and asks first',
];
