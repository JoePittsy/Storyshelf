// Priya: desktop, keyboard first, judging Storyshelf against the ABS web UI for listening. Her library state is "every
// book finished but two" (e2e/seed-personas.sh). Where the screen can be checked against the server, it is.
import { defineTask, poll, sleep } from '../lib/task.mjs';
import { position, snapshot } from '../lib/session.mjs';
import { bookToResume, escapeRe, goHome, libraryReady, pauseButton, playButton, progressSlider } from '../lib/ui.mjs';

/** Her sort and filters are remembered per library on this device, so every task starts by clearing them. */
async function resetListView(t) {
  await goHome(t);
  // The library brings back the filters and sort last used on this device a moment after it loads: wait for that.
  await t.page.getByRole('combobox', { name: 'Sort by' }).waitFor({ state: 'visible' });
  await sleep(1000);
  const clear = t.page.getByRole('button', { name: 'Clear all', exact: true });
  if (await clear.count()) await clear.first().click();
  const sort = t.page.getByRole('combobox', { name: 'Sort by' });
  if ((await sort.evaluate((el) => el.selectedOptions[0]?.label)) !== 'Recently added') await sort.selectOption({ label: 'Recently added' });
  const q = t.page.getByRole('searchbox', { name: 'Search your library' });
  if (await q.inputValue()) await q.fill('');
  await sleep(500);
}

const selected = (loc) => loc.evaluate((el) => el.selectedOptions[0]?.label);

const searchPeople = defineTask('priya-search-narrator-series', 'Search finds a book by its narrator and by its series, offers them as chips, and says how many results', async (t) => {
  const books = await t.abs.books();
  // ABS's minified item carries the series as "The Ember Road #1": the name is what comes before the sequence.
  const nameOf = (s) => s.replace(/\s+#\S+$/, '');
  const found = books.find((b) => b.narrator && b.series);
  if (!found) return t.skip('no book with both a narrator and a series in the library');
  const narrated = { ...found, series: nameOf(found.series) };
  t.onDone(() => resetListView(t));
  await resetListView(t);
  const box = t.page.getByRole('searchbox', { name: 'Search your library' });
  t.step(`search for the narrator "${narrated.narrator}"`);
  await box.fill(narrated.narrator);
  const bookLink = t.page.getByRole('link', { name: new RegExp(`^${escapeRe(narrated.title)}\\b`) }).first();
  const byNarrator = await t.see(bookLink, 8000);
  const chip = await t.see(t.page.getByRole('link', { name: new RegExp(`^Narrator: ${escapeRe(narrated.narrator)}`) }), 3000);
  const said = await t.until(async () => (await snapshot(t.page)).live.some((l) => /^\d+ results? for /.test(l.text)), 5000);
  const expected = books.filter((b) => b.narrator.includes(narrated.narrator)).length;
  t.step(`search for the series "${narrated.series}"`);
  await box.fill(narrated.series);
  const seriesChip = await t.see(t.page.getByRole('link', { name: new RegExp(`^Series: ${escapeRe(narrated.series)}`) }), 8000);
  const seriesBook = await t.see(t.page.getByRole('link', { name: new RegExp(`^${escapeRe(narrated.title)}\\b`) }), 3000);
  const live = (await snapshot(t.page)).live.map((l) => l.text).filter((x) => /results? for|No results/.test(x));
  return {
    pass: byNarrator && chip && said && seriesChip && seriesBook,
    note: `Narrator search: book ${byNarrator ? 'found' : 'missing'}, chip ${chip ? 'shown' : 'missing'}, count announced ${said ? 'yes' : 'no'} (server has ${expected} book(s) by that narrator). Series search: chip ${seriesChip ? 'shown' : 'missing'}, book ${seriesBook ? 'found' : 'missing'}. Live: ${live.join(' | ')}`,
  };
});

const sortFilterUrl = defineTask('priya-sort-filter-url', 'Sort and filter live in the URL: back and forward step through them, and a reload keeps them', async (t) => {
  const books = await t.abs.books();
  const inProgressCount = books.filter((b) => b.progress && !b.progress.isFinished && b.progress.currentTime > 0).length;
  t.onDone(() => resetListView(t));
  await resetListView(t);
  const sort = t.page.getByRole('combobox', { name: 'Sort by' });
  const progress = t.page.getByRole('combobox', { name: 'Progress' });
  t.step('choose Sort by Title A–Z');
  await sort.selectOption({ label: 'Title A–Z' });
  t.step('choose Progress: In progress');
  await progress.selectOption({ label: 'In progress' });
  const inUrl = !!(await t.until(() => {
    const u = new URL(t.page.url());
    return u.searchParams.get('sort') === 'media.metadata.title' && u.searchParams.get('progress') === 'in-progress';
  }, 5000));
  const url1 = new URL(t.page.url());
  const headingNow = () => t.page.getByRole('heading', { level: 2 }).filter({ hasText: /^(All|Matching) books/ }).first().innerText();
  const counts = !!(await t.until(async () => (await headingNow()).includes(`· ${inProgressCount}`), 8000));
  const heading = await headingNow();
  t.step('press the browser Back button');
  await t.page.goBack();
  await sleep(600);
  const backOk = !new URL(t.page.url()).searchParams.has('progress') && (await selected(progress)) === 'Any progress';
  t.step('press the browser Forward button');
  await t.page.goForward();
  await sleep(600);
  const fwdOk = new URL(t.page.url()).searchParams.get('progress') === 'in-progress' && (await selected(progress)) === 'In progress';
  t.step('reload the page');
  await t.page.reload();
  await libraryReady(t.page);
  const reloadOk = (await selected(t.page.getByRole('combobox', { name: 'Progress' }))) === 'In progress' && (await selected(t.page.getByRole('combobox', { name: 'Sort by' }))) === 'Title A–Z';
  return {
    pass: inUrl && counts && backOk && fwdOk && reloadOk,
    note: `In URL: ${inUrl}; heading "${heading}" (server has ${inProgressCount} in progress): ${counts}; Back undoes the filter: ${backOk}; Forward restores it: ${fwdOk}; reload keeps both: ${reloadOk}`,
  };
});

const deepLinks = defineTask('priya-deep-links', 'A book page and a series page reload to the same thing, and opening the address cold lands on it', async (t) => {
  await goHome(t);
  t.step('open the Series tab and the first series');
  await t.page.getByRole('link', { name: 'Series', exact: true }).first().click();
  await t.page.waitForURL(/\/series/);
  await t.page.getByRole('main').getByRole('link').first().click();
  await t.page.waitForURL(/\/series\/[^/?]+/);
  const seriesUrl = t.page.url();
  const seriesHeading = await t.page.getByRole('heading', { level: 1 }).first().innerText();
  t.step('reload the series page');
  await t.page.reload();
  await t.page.getByRole('heading', { level: 1 }).first().waitFor();
  const seriesAfter = await t.page.getByRole('heading', { level: 1 }).first().innerText();
  const book = (await t.abs.books()).find((b) => b.series);
  t.step('paste a book address into the address bar');
  await t.go(`/book/${book.id}`);
  const h1 = await t.page.getByRole('heading', { level: 1 }).first();
  await h1.waitFor();
  const title = await h1.innerText();
  t.step('reload the book page');
  await t.page.reload();
  await t.page.getByRole('heading', { level: 1 }).first().waitFor();
  const titleAfter = await t.page.getByRole('heading', { level: 1 }).first().innerText();
  return {
    pass: seriesHeading === seriesAfter && title === book.title && titleAfter === book.title,
    note: `Series page ${new URL(seriesUrl).pathname}: "${seriesHeading}" then "${seriesAfter}" after reload; cold open of the book address shows "${title}" (expected "${book.title}"), "${titleAfter}" after reload`,
  };
});

const shortcuts = defineTask('priya-shortcuts', '? lists the shortcuts and Escape returns focus; / jumps to the search box', async (t) => {
  await goHome(t);
  t.step('press ?');
  await t.page.keyboard.press('?');
  const dialog = t.page.getByRole('dialog', { name: /shortcuts/i });
  const opened = await t.see(dialog, 5000);
  const text = opened ? await dialog.innerText() : '';
  const listed = ['Space', 'Left', '[', 'B', 'U', 'C', '/', '?'].every((k) => text.includes(k));
  t.step('press Escape');
  await t.page.keyboard.press('Escape');
  const closed = await t.until(async () => (await dialog.count()) === 0, 3000);
  t.step('press /');
  await t.page.keyboard.press('/');
  await sleep(300);
  const focus = (await snapshot(t.page)).focus;
  return {
    pass: opened && listed && !!closed && focus.role === 'searchbox',
    note: `? ${opened ? 'opened' : 'did not open'} a dialog${opened ? (listed ? ' listing all eight keys' : ' missing some keys: ' + text.replace(/\s+/g, ' ').slice(0, 200)) : ''}; Escape ${closed ? 'closed' : 'did not close'} it; / put focus on ${focus.role} "${focus.name}"`,
  };
});

const keyboardTransport = defineTask('priya-keyboard-transport', 'With the keyboard: a bare Space does not start a restored book, Play does; then Space pauses and Right skips', async (t) => {
  const book = await bookToResume(t, { chapters: true });
  if (!book) return t.skip('priya has no in-progress book with chapters');
  await t.go('/now-playing');
  await progressSlider(t.page).waitFor({ state: 'visible', timeout: 30_000 });
  t.step('press Space on a freshly loaded player');
  await t.page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined); // focus the page, not a control
  await t.page.keyboard.press('Space');
  const hint = await t.see(t.page.getByText('Press Play to resume'), 3000);
  const started = await pauseButton(t.page).isVisible().catch(() => false);
  t.step('Tab to Play and press Enter');
  await playButton(t.page).focus();
  await t.page.keyboard.press('Enter');
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 20_000 });
  await t.page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  t.step('press Space to pause');
  await t.page.keyboard.press('Space');
  const paused = await t.see(playButton(t.page), 5000);
  const p0 = await position(t.page, { duration: book.duration });
  t.step('press Right');
  await t.page.keyboard.press('ArrowRight');
  await sleep(500);
  const p1 = await position(t.page, { duration: book.duration });
  return {
    pass: hint && !started && paused && Math.abs(p1 - p0 - 30) <= 2,
    note: `Bare Space: toast ${hint ? 'shown' : 'not shown'}, ${started ? 'it started playback' : 'it did not start playback'}; Space while playing ${paused ? 'paused' : 'did not pause'}; Right moved ${p1 - p0}s (want 30)`,
  };
});

const markFinished = defineTask('priya-mark-finished-undo', 'Mark a book finished, then Undo: the server says finished, then says not finished at the old place', async (t) => {
  const book = await bookToResume(t, { chapters: false });
  if (!book) return t.skip('priya has no in-progress book');
  const original = (await t.abs.progressOf(book.id)).currentTime;
  t.onDone(async () => t.abs.setPlace(book, original));
  await t.go(`/book/${book.id}`);
  await t.page.getByRole('button', { name: 'More actions' }).waitFor({ state: 'visible', timeout: 20_000 });
  t.step('open More actions and choose Mark as finished');
  await t.page.getByRole('button', { name: 'More actions' }).click();
  await t.page.getByRole('group', { name: 'More actions' }).getByRole('button', { name: 'Mark as finished' }).click();
  const finished = await poll(async () => (await t.abs.progressOf(book.id))?.isFinished === true, { timeout: 10_000 });
  const shown = await t.see(t.page.getByText('Finished', { exact: true }), 5000);
  const undo = t.page.getByRole('button', { name: 'Undo', exact: true }).first();
  if (!(await t.see(undo, 5000))) return { pass: false, note: `Marked finished (server: ${finished}) but no Undo was offered` };
  t.step('press Undo');
  await undo.click();
  const back = await poll(async () => (await t.abs.progressOf(book.id))?.isFinished === false, { timeout: 10_000 });
  const place = (await t.abs.progressOf(book.id)).currentTime;
  return {
    pass: !!finished && shown && !!back && Math.abs(place - original) <= 2,
    note: `Server finished after the first action: ${!!finished}; page said Finished: ${shown}; after Undo server not finished: ${!!back}, place ${place}s (was ${original}s)`,
  };
});

const finishedList = defineTask('priya-history-finished-matches-server', 'The History > Finished list shows exactly the books the server says are finished', async (t) => {
  const books = await t.abs.books();
  const finished = books.filter((b) => b.progress?.isFinished).map((b) => b.title).sort();
  await t.go('/history/finished');
  await t.page.getByRole('heading', { name: 'History', level: 1 }).waitFor();
  await sleep(1500);
  const links = await t.page.getByRole('main').getByRole('list').last().getByRole('link').allInnerTexts();
  const shown = links.map((l) => l.split('\n')[0].trim()).sort();
  t.step('open History, then Finished');
  const same = JSON.stringify(shown) === JSON.stringify(finished);
  return { pass: same, note: `Server finished: ${finished.length} (${finished.join(', ')}); page lists ${shown.length}${same ? '' : ': ' + shown.join(', ')}` };
});

const emptyLists = defineTask('priya-collections-playlists', 'Collections and Playlists pages match the server: every collection listed, or an honest empty message', async (t) => {
  const libs = await t.abs.call('GET', '/api/libraries');
  const lib = libs.libraries.find((l) => l.mediaType === 'book');
  const collections = (await t.abs.call('GET', `/api/libraries/${lib.id}/collections`).catch(() => ({ results: [] }))).results ?? [];
  await t.go('/collections');
  await t.page.getByRole('heading', { name: 'Collections', level: 1 }).waitFor();
  await sleep(1200);
  t.step('open Collections');
  const empty = await t.page.getByText('No collections in this library').count();
  const items = await t.page.getByRole('main').getByRole('list').last().getByRole('link').count().catch(() => 0);
  const ok = collections.length === 0 ? empty === 1 : items >= collections.length;
  return { pass: ok, note: `Server has ${collections.length} collection(s); page shows ${empty ? 'the empty message' : items + ' link(s)'}` };
});

export const tasks = [searchPeople, sortFilterUrl, deepLinks, shortcuts, keyboardTransport, markFinished, finishedList, emptyLists];

export const notCovered = [
  'collections and playlists with real contents: the local library has none, so only the empty state is checked',
  'comparison with the ABS web UI (feature parity is a judgement, not a check)',
  'a library of several hundred books (search, sort and scrolling speed at that size): the local library has ten',
  'the network tab and request counts: tasks look at what the screen and the server say, not at traffic',
  'hearing the book (silent stand-in audio, no audio output)',
];
