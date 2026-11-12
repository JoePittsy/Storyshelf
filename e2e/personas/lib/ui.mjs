// Shared "how a person does this" helpers for the task files: the accessible names the app uses, in one place, so a
// rename in the app breaks one line here and not forty. Names come from reading the screens and from running them; the
// existing Playwright suite (apps/web/e2e) relies on the same ones.

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const libraryHeading = (page) => page.getByRole('heading', { name: 'Library', level: 1 });
export const playButton = (page) => page.getByRole('button', { name: 'Play', exact: true }).first();
export const pauseButton = (page) => page.getByRole('button', { name: 'Pause', exact: true }).first();
export const miniPlayer = (page) => page.getByRole('region', { name: 'Now playing' });
export const sleepButton = (page) => page.getByRole('button', { name: /^Sleep timer/ }).first();
export const speedButton = (page) => page.getByRole('button', { name: /^Playback speed/ }).first();
export const progressSlider = (page) => page.getByRole('slider', { name: /^Progress through / }).first();
export const toast = (page, text) => page.getByText(text).first();
/** The resume hero's action: "Resume · 13h 58m left: <title>". */
export const heroResume = (page) => page.getByRole('button', { name: /^Resume.*: .+$/ }).first();

/** A tap on a phone, a click on a desktop: same intent, the input the device really has. */
export const press = (ctx, locator) => (ctx.device === 'phone' ? locator.tap() : locator.click());

/** A real touch at the centre of a control, after scrolling it into view: for tiles in a shelf that Playwright's own tap() finds "unstable". */
export async function tapAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await locator.boundingBox();
  if (!box) throw new Error('tapAt: the control has no box');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/** The signed-in library, loaded: heading in the page and the loading skeletons gone. */
export async function libraryReady(page) {
  await libraryHeading(page).waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator('[aria-label="Loading"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
}

/**
 * Whether the page is under a service worker's control (a production build, once the worker has installed). A new
 * worker only takes over pages loaded after it, so if it is active but not yet in charge the page is reloaded once.
 */
export async function serviceWorkerReady(ctx) {
  const state = () =>
    ctx.page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'none';
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return 'unregistered';
      return navigator.serviceWorker.controller ? 'controlling' : reg.active ? 'active' : 'installing';
    });
  const end = Date.now() + 20_000;
  let s = await state();
  while (s !== 'controlling' && s !== 'none' && Date.now() < end) {
    if (s === 'active') await ctx.page.reload({ waitUntil: 'domcontentloaded' });
    await ctx.page.waitForTimeout(500);
    s = await state();
  }
  return s === 'controlling';
}

/** Opens the library from scratch (a full page load, like opening the app) and waits for it. */
export async function goHome(ctx) {
  await ctx.go('/');
  await libraryReady(ctx.page);
}

/** Loads the full player page directly (a reload there restores the last book, paused) and waits for its slider. */
export async function openPlayerPage(ctx) {
  await ctx.go('/now-playing');
  await progressSlider(ctx.page).waitFor({ state: 'visible', timeout: 30_000 });
}

/** True when the player is playing: its button reads Pause. */
export const isPlaying = (page) => pauseButton(page).isVisible().catch(() => false);

/** Pauses if playing, so a task starts from a known state. Not counted as a step: it is housekeeping. */
export async function ensurePaused(page) {
  if (await isPlaying(page)) await pauseButton(page).click();
  await playButton(page).waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
}

/** Seconds left on the sleep timer from its button's name ("Sleep timer, 14:52"), or NaN when none is armed. */
export async function sleepSecondsLeft(page) {
  const name = (await sleepButton(page).getAttribute('aria-label')) ?? '';
  const m = /^Sleep timer, (?:(\d+):)?(\d+):(\d{2})$/.exec(name);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** Opens the sleep timer list and picks a row ("15 minutes", "End of chapter", "Add 15 minutes", "Off"). */
export async function chooseSleep(ctx, optionName) {
  await press(ctx, sleepButton(ctx.page));
  await press(ctx, ctx.page.getByRole('group', { name: 'Sleep timer' }).getByRole('button', { name: optionName, exact: true }));
}

/** Switches the sleep timer off if one is armed (for a task's cleanup). */
export async function sleepOff(ctx) {
  if (Number.isNaN(await sleepSecondsLeft(ctx.page)) && !/End of chapter/.test((await sleepButton(ctx.page).getAttribute('aria-label')) ?? '')) return;
  await chooseSleep(ctx, 'Off');
}

/** Opens a player sheet ("Bookmarks", "History", "Chapters") from the player page: a labelled button on desktop and phone alike. */
export async function openSheet(ctx, name) {
  await press(ctx, ctx.page.getByRole('button', { name, exact: true }).first());
  const dialog = ctx.page.getByRole('dialog', { name });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  return dialog;
}

/** Opens the chapter list on whichever layout is showing (a sheet on the phone, the column on a wide screen) and picks chapter n, 1-based. */
export async function pickChapter(ctx, n) {
  const row = new RegExp(`^Chapter ${n}\\b`);
  if (ctx.device === 'phone') {
    const dialog = await openSheet(ctx, 'Chapters');
    await press(ctx, dialog.getByRole('button', { name: row }).first());
  } else {
    await press(ctx, ctx.page.getByRole('region', { name: 'Chapters' }).getByRole('button', { name: row }).first());
  }
}

/** The book the full player is showing, as lib/abs.mjs knows it (chosen by the player's title, then looked up by property-free id). */
export async function bookOnPlayer(ctx) {
  const title = (await ctx.page.locator('main h1').first().innerText()).trim();
  const book = (await ctx.abs.books()).find((b) => b.title === title);
  if (!book) throw new Error(`The player shows "${title}", which the ABS library doesn't list`);
  return book;
}

/** The book a person would resume: their most recent in-progress book with chapters; failing that, any in-progress one. */
export async function bookToResume(ctx, { chapters = true } = {}) {
  const books = (await ctx.abs.books()).filter((b) => b.progress && !b.progress.isFinished && b.progress.currentTime > 0);
  const pool = chapters ? books.filter((b) => b.chapters >= 2 && b.duration >= 1800) : books;
  pool.sort((a, b) => (b.progress.lastUpdate ?? 0) - (a.progress.lastUpdate ?? 0));
  return pool[0];
}

/** Resumes the hero book from the library with one press, and waits until it is playing. Returns the pressed label. */
export async function resumeHero(ctx) {
  const hero = heroResume(ctx.page);
  await hero.waitFor({ state: 'visible', timeout: 20_000 });
  const label = (await hero.getAttribute('aria-label')) ?? (await hero.innerText());
  await press(ctx, hero);
  await pauseButton(ctx.page).waitFor({ state: 'visible', timeout: 20_000 });
  return label;
}
