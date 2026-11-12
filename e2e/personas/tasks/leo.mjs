// Leo: phone, impatient, hard on apps. Faults are made with the browser's own switches (context.setOffline, a delayed
// route, a resized viewport), so they happen the same way every run. His server state is "no listening history"; tasks
// that start books delete the listening record afterwards.
import { defineTask, sleep } from '../lib/task.mjs';
import { position } from '../lib/session.mjs';
import { escapeRe, goHome, libraryHeading, miniPlayer, pauseButton, playButton, press, progressSlider, tapAt } from '../lib/ui.mjs';

const forget = (t, book) => async () => {
  await t.abs.call('DELETE', `/api/me/progress/${(await t.abs.progressOf(book.id))?.id ?? book.id}`).catch(() => undefined);
};
const unstartedWithChapters = async (t) => (await t.abs.books()).filter((b) => !b.progress && b.chapters >= 4 && b.duration >= 3600);

/** Starts a book from its own page, the way a person who has just found it would. Leaves it playing on the page. */
async function playFromBookPage(t, book) {
  await t.go(`/book/${book.id}`);
  const go = t.page.getByRole('main').getByRole('button', { name: /^(Play|Resume)/ }).first();
  await go.waitFor({ state: 'visible', timeout: 20_000 });
  await press(t, go);
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 20_000 });
}

const stopAndForget = (t, book) => async () => {
  await t.context.setOffline(false);
  await t.page.unroute('**/*').catch(() => undefined);
  if (await pauseButton(t.page).isVisible().catch(() => false)) await pauseButton(t.page).click().catch(() => undefined);
  await forget(t, book)();
};

const secondTap = defineTask('leo-second-tap-same-book', 'A second tap about 300 ms after Play on a Recently added tile does not change the book or start another', async (t) => {
  const others = await t.abs.books();
  await goHome(t);
  const shelf = t.page.getByRole('heading', { name: 'Recently added', level: 2 }).locator('xpath=../..');
  const play = shelf.getByRole('button', { name: /^Play / }).first();
  if (!(await t.see(play, 10_000))) return t.skip('no "Play <title>" tile in Recently added');
  await play.scrollIntoViewIfNeeded();
  const label = (await play.getAttribute('aria-label')) ?? '';
  const first = label.replace(/^Play /, '');
  const firstBook = others.find((b) => b.title === first);
  t.onDone(async () => {
    if (await pauseButton(t.page).isVisible().catch(() => false)) await pauseButton(t.page).click().catch(() => undefined);
    for (const b of await t.abs.books()) if (b.progress && !others.find((o) => o.id === b.id)?.progress) await forget(t, b)();
  });
  const box = await play.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  t.step('tap Play on the first tile');
  await t.page.touchscreen.tap(x, y);
  await sleep(300);
  t.step('tap the same spot again');
  await t.page.touchscreen.tap(x, y);
  const mini = miniPlayer(t.page);
  await mini.waitFor({ state: 'visible', timeout: 20_000 });
  await mini.getByRole('button', { name: 'Pause' }).waitFor({ state: 'visible', timeout: 20_000 });
  await sleep(1500);
  const shows = ((await mini.innerText()) + (await mini.getByRole('button', { name: /^Open player/ }).getAttribute('aria-label').catch(() => ''))).includes(first) || (await mini.innerText()).includes(first);
  const after = await t.abs.books();
  // ABS only makes a listening record once the player first syncs, so the first book may not have one yet; what must
  // never exist is a record for any other book.
  const started = after.filter((b) => b.progress && !others.find((o) => o.id === b.id)?.progress).map((b) => b.title);
  const wrong = started.filter((title) => title !== first);
  return {
    pass: shows && wrong.length === 0,
    note: `Tapped "${first}" twice; mini player ${shows ? 'shows' : 'does not show'} it; other books with a new listening record: ${wrong.join(', ') || 'none'}${firstBook ? '' : ' (first book not found on server)'}`,
  };
});

const offlineMidPlay = defineTask('leo-offline-10s-mid-play', 'Lose the network for 10 s mid-play, get it back: the player recovers (plays on or Play works) and the place is not lost', async (t) => {
  const [book] = await unstartedWithChapters(t);
  if (!book) return t.skip('no unstarted book with chapters');
  t.onDone(stopAndForget(t, book));
  t.step('start a book');
  await playFromBookPage(t, book);
  await sleep(4000);
  const before = await position(t.page, { duration: book.duration });
  t.step('network off for 10 s');
  await t.context.setOffline(true);
  await sleep(10_000);
  t.step('network back on');
  await t.context.setOffline(false);
  await sleep(4000);
  const visible = await t.see(t.page.locator('main'), 3000);
  let state = (await pauseButton(t.page).isVisible()) ? 'still playing' : 'paused';
  if (state === 'paused') {
    t.step('press Play');
    await press(t, playButton(t.page));
    await pauseButton(t.page).waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    state += (await pauseButton(t.page).isVisible()) ? ', Play worked' : ', Play did not start it';
  }
  const a = await position(t.page, { duration: book.duration });
  await sleep(4000);
  const b = await position(t.page, { duration: book.duration });
  const server = await t.abs.savedPosition(book.id);
  return {
    pass: visible && b - a >= 2 && a >= before - 1,
    note: `Place ${before}s before; after recovery ${state}; position ${a}s then ${b}s four seconds on; server holds ${Math.round(server)}s`,
  };
});

const reloadMidPlay = defineTask('leo-reload-mid-play', 'Reload while playing: the book comes back at the place he was at, not at the start and not ahead', async (t) => {
  const [book] = await unstartedWithChapters(t);
  if (!book) return t.skip('no unstarted book with chapters');
  t.onDone(stopAndForget(t, book));
  t.step('start a book');
  await playFromBookPage(t, book);
  await sleep(12_000);
  const before = await position(t.page, { duration: book.duration });
  t.step('reload the page while it plays');
  await t.page.reload();
  await t.page.getByRole('main').waitFor({ state: 'visible' });
  await sleep(2500);
  await t.go('/now-playing');
  await progressSlider(t.page).waitFor({ state: 'visible', timeout: 30_000 });
  const after = await position(t.page, { duration: book.duration });
  return {
    pass: after >= before - 12 && after <= before + 3 && after > 0,
    note: `Playing at ${before}s when reloaded; the player then shows ${after}s (a sync lag of up to 10 s and a rewind of a few seconds are by design)`,
  };
});

const unknownUrls = defineTask('leo-unknown-urls', 'Made-up addresses end somewhere sensible, never a blank page', async (t) => {
  const tries = ['/book/not-a-real-id', '/series/not-a-real-id', '/author/not-a-real-id', '/collection/not-a-real-id', '/nonsense/here', '/now-playing/extra'];
  const results = [];
  for (const path of tries) {
    t.step(`open ${path}`);
    await t.go(path);
    await sleep(2500);
    const text = (await t.page.locator('main').first().innerText().catch(() => '')).trim();
    const where = new URL(t.page.url()).pathname;
    results.push({ path, where, blank: text.length < 3, text: text.replace(/\s+/g, ' ').slice(0, 70) });
  }
  const blank = results.filter((r) => r.blank);
  return {
    pass: blank.length === 0,
    note: results.map((r) => `${r.path} -> ${r.where}${r.blank ? ' BLANK' : `: "${r.text}"`}`).join(' | '),
  };
});

const backMidLoad = defineTask('leo-back-mid-load', 'Press Back while a book page is still loading: the library comes back, and going Forward still loads the book', async (t) => {
  const books = await t.abs.books();
  await goHome(t);
  // Slow the book's data right down, so Back lands mid-load every time.
  await t.page.route('**/api/items/*', async (route) => {
    await sleep(2500);
    await route.continue().catch(() => undefined);
  });
  t.onDone(() => t.page.unroute('**/api/items/*').catch(() => undefined));
  const tile = t.page.getByRole('main').getByRole('link', { name: new RegExp(`^${escapeRe(books[0].title)}\\b`) }).last();
  t.step('tap a book');
  await press(t, tile);
  await t.page.waitForURL(/\/book\//);
  t.step('press Back straight away');
  await t.page.goBack();
  const home = await t.see(libraryHeading(t.page).first(), 1).then(() => true).catch(() => true);
  await libraryHeading(t.page).waitFor({ state: 'attached', timeout: 5000 });
  const onLibrary = new URL(t.page.url()).pathname === '/';
  await sleep(3000); // the late answer arrives now
  const stillLibrary = new URL(t.page.url()).pathname === '/';
  t.step('press Forward');
  await t.page.goForward();
  const loaded = await t.see(t.page.getByRole('heading', { name: books[0].title, level: 1 }), 15_000);
  return { pass: home && onLibrary && stillLibrary && loaded, note: `Back landed on ${onLibrary ? 'the library' : 'something else'}; ${stillLibrary ? 'stayed there when the slow answer arrived' : 'was pulled away when the slow answer arrived'}; Forward ${loaded ? 'loaded' : 'did not load'} the book page` };
});

const rotate = defineTask('leo-rotate', 'Rotate to landscape and back on the library and the player: no sideways scroll, controls still reachable', async (t) => {
  t.onDone(() => t.page.setViewportSize({ width: 390, height: 664 }));
  const portrait = t.page.viewportSize();
  const out = [];
  for (const [name, size] of [['landscape', { width: portrait.height, height: portrait.width }], ['portrait again', portrait]]) {
    t.step(`rotate to ${name}`);
    await t.page.setViewportSize(size);
    for (const path of ['/', '/now-playing']) {
      await t.go(path);
      await sleep(1800);
      if (path === '/now-playing' && !/now-playing/.test(t.page.url())) continue; // no restored book to show
      const over = await t.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const controls = path === '/' ? await libraryHeading(t.page).count() : await t.page.getByRole('button', { name: /^(Play|Pause)$/ }).first().isVisible();
      out.push({ name, path, over, controls: !!controls });
    }
  }
  const bad = out.filter((r) => r.over > 1 || !r.controls);
  return { pass: bad.length === 0 && out.length > 0, note: bad.length ? bad.map((r) => `${r.name} ${r.path}: ${r.over}px sideways, controls ${r.controls ? 'ok' : 'missing'}`).join('; ') : `Checked ${out.map((r) => r.name + ' ' + r.path).join(', ')}: no sideways scroll, controls present` };
});

const tapSpam = defineTask('leo-tap-spam-play', 'Hammer the Play button six times: it ends in a state its label tells the truth about, and the place has not jumped', async (t) => {
  const [book] = await unstartedWithChapters(t);
  if (!book) return t.skip('no unstarted book with chapters');
  t.onDone(stopAndForget(t, book));
  await playFromBookPage(t, book);
  // Open the player from the mini player (no reload: a reload this early may find nothing saved to restore yet).
  await press(t, miniPlayer(t.page).getByRole('button', { name: /^Open player/ }));
  await progressSlider(t.page).waitFor({ state: 'visible', timeout: 30_000 });
  const p0 = await position(t.page, { duration: book.duration });
  t.step('tap the player\'s Play/Pause six times, 120 ms apart');
  const button = t.page.getByRole('main').getByRole('button', { name: /^(Play|Pause)$/ }).first();
  await button.waitFor({ state: 'visible' });
  await sleep(1000); // the player sheet is still sliding in
  const box = await button.boundingBox();
  for (let i = 0; i < 6; i++) {
    await t.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(120);
  }
  await sleep(3000);
  const playing = await pauseButton(t.page).isVisible();
  const paused = await playButton(t.page).isVisible();
  const a = await position(t.page, { duration: book.duration });
  await sleep(3000);
  const b = await position(t.page, { duration: book.duration });
  const truthful = playing !== paused && (playing ? b - a >= 2 : Math.abs(b - a) <= 1);
  return { pass: truthful && Math.abs(a - p0) <= 40, note: `Before ${p0}s; after six taps the button says ${playing ? 'Pause (playing)' : paused ? 'Play (paused)' : 'neither'}; position ${a}s then ${b}s three seconds later` };
});

// Not the browser's offline switch: the app notices that one and swaps the library for its offline home, which is the
// designed path. The flaky case is a connection the browser still calls up while requests fail, so the requests are failed.
const failedRequests = defineTask('leo-play-when-requests-fail', 'Tap Play while the server\'s requests are failing: he is told and can try again, nothing is left hanging, and it works once they succeed', async (t) => {
  await goHome(t);
  const tile = t.page.getByRole('button', { name: /^Play / }).first();
  if (!(await t.see(tile, 10_000))) return t.skip('no "Play <title>" tile');
  const title = ((await tile.getAttribute('aria-label')) ?? '').replace(/^Play /, '');
  const book = (await t.abs.books()).find((b) => b.title === title);
  t.onDone(stopAndForget(t, book ?? { id: '' }));
  t.step('requests start failing, tap Play');
  await t.page.route(/\/api\/items\/[^/]+\/play/, (route) => route.abort('connectionreset'));
  await tapAt(t.page, tile);
  // What he sees: a visible Offline badge or an error toast (a hidden live-region copy of the words doesn't count).
  const visibleWords = t.page.getByText(/offline|couldn.t|can.t|try again|failed/i).filter({ visible: true });
  const told = await t.see(visibleWords, 15_000);
  const said = (await visibleWords.first().innerText().catch(() => '')).trim();
  const stuck = await t.page.locator('[aria-busy="true"]').first().isVisible().catch(() => false);
  t.step('requests succeed again; wait, without touching anything');
  await t.page.unroute(/\/api\/items\/[^/]+\/play/);
  const back = await t.until(async () => (await t.page.getByText('Offline', { exact: true }).filter({ visible: true }).count()) === 0, 30_000);
  t.step('press Play');
  const retry = t.page.getByRole('button', { name: 'Try again', exact: true }).first();
  if (await retry.isVisible().catch(() => false)) await tapAt(t.page, retry);
  else await tapAt(t.page, playButton(t.page));
  const works = await t.see(pauseButton(t.page), 20_000);
  return {
    pass: told && !stuck && !!back && works,
    note: `He saw "${said}" (${told}); a control left busy: ${stuck}; the Offline state cleared by itself within 30 s once requests worked: ${!!back}; Play worked afterwards: ${works}`,
  };
});

export const tasks = [secondTap, offlineMidPlay, reloadMidPlay, unknownUrls, backMidLoad, rotate, tapSpam, failedRequests];

export const notCovered = [
  'a real flaky connection (loss, latency, a captive portal): only the browser\'s on/off switch and one delayed request are used',
  'switching to another app and back on a real phone (page lifecycle on iOS), and the phone locking mid-play',
  'rotating a real device (the on-screen keyboard, the safe-area insets and the browser toolbar changing size): only the viewport is resized',
  'cellular versus wifi hand-over',
  'whether the audio itself stalls or stutters when the network drops (silent stand-in audio, no audio output)',
];
