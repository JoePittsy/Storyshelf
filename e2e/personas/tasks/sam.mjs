// Sam: desktop, keyboard only (no mouse event is ever sent), judging names, focus, live regions, zoom and contrast. What a
// screen reader would say is read from the browser's accessibility tree and from the live regions' text, not guessed.
// Sam's server state is "no listening history"; tasks that start a book put that back afterwards.
import { defineTask, sleep } from '../lib/task.mjs';
import { contrast, snapshot } from '../lib/session.mjs';
import { goHome, pauseButton } from '../lib/ui.mjs';

/** Presses Tab until the focused control passes `test`, at most `max` times. Returns the number of presses, or -1. */
async function tabTo(page, test, max = 80) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    const { focus } = await snapshot(page);
    if (test(focus)) return i;
  }
  return -1;
}

const live = async (page) => (await snapshot(page)).live.map((l) => l.text);

/** Whatever a task started is forgotten again: delete the listening record. */
const forget = (t, book) => async () => {
  await t.abs.call('DELETE', `/api/me/progress/${(await t.abs.progressOf(book.id))?.id ?? book.id}`).catch(() => undefined);
};

const skipLink = defineTask('sam-skip-link-first', 'The skip link is the first Tab stop, and using it puts focus on the page content', async (t) => {
  await goHome(t);
  // Back to the very start of the page, as after a load: focus on nothing.
  await t.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  t.step('press Tab');
  await t.page.keyboard.press('Tab');
  const first = (await snapshot(t.page)).focus;
  t.step('press Enter on it');
  await t.page.keyboard.press('Enter');
  await sleep(300);
  const after = (await snapshot(t.page)).focus;
  return {
    pass: first.role === 'link' && /skip to content/i.test(first.name) && after.role === 'main',
    note: `First Tab stop: ${first.role} "${first.name}"; after Enter focus is on ${after.role} "${after.name}"`,
  };
});

const playFocusLive = defineTask('sam-play-focus-and-announcement', 'Play on a card keeps focus on a control, and "Playing <title>" is announced in a live region', async (t) => {
  await goHome(t);
  // A card's Play button: "Play <title>" on a Recently added tile (a book that isn't already loaded in the player).
  const tile = t.page.getByRole('button', { name: /^Play .+/ }).first();
  if (!(await t.see(tile, 10_000))) return t.skip('the library shows no "Play <title>" tile (every book is in progress or in the player)');
  const label = (await tile.getAttribute('aria-label')) ?? '';
  const title = label.replace(/^Play /, '');
  const book = (await t.abs.books()).find((b) => b.title === title);
  t.onDone(async () => {
    if (await pauseButton(t.page).isVisible().catch(() => false)) await pauseButton(t.page).click();
    if (book) await forget(t, book)();
  });
  t.step(`Tab to "${label}"`);
  const presses = await tabTo(t.page, (f) => f.role === 'button' && f.name === label);
  if (presses < 0) return { pass: false, note: `Tab never reached "${label}" within 80 presses` };
  t.step('press Enter');
  await t.page.keyboard.press('Enter');
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 20_000 });
  await sleep(500);
  const { focus } = await snapshot(t.page);
  const said = (await live(t.page)).includes(`Playing ${title}`);
  const onControl = focus.role !== 'none' && focus.role !== 'body' && focus.role !== 'document' && !!focus.name;
  return {
    pass: onControl && said,
    note: `After Enter focus is on ${focus.role} "${focus.name}" (want a named control, not the page); live regions: ${(await live(t.page)).map((x) => `"${x}"`).join(', ')}; "Playing ${title}" ${said ? 'present' : 'absent'}; Tab presses needed: ${presses}`,
  };
});

const searchCount = defineTask('sam-search-announces-count', 'Search says how many results it found, and says so when there are none', async (t) => {
  const books = await t.abs.books();
  const narrated = books.find((b) => b.narrator);
  await goHome(t);
  t.step('Tab to the search box');
  const presses = await tabTo(t.page, (f) => f.role === 'searchbox');
  if (presses < 0) return { pass: false, note: 'Tab never reached the search box' };
  t.step(`type "${narrated.narrator}"`);
  await t.page.keyboard.type(narrated.narrator, { delay: 40 });
  const found = await t.until(async () => (await live(t.page)).find((x) => /^\d+ results? for /.test(x)), 8000);
  const tiles = await t.page.getByRole('main').getByRole('link').filter({ hasText: /\S/ }).evaluateAll((els) => els.filter((e) => e.getAttribute('href')?.startsWith('/book/')).length);
  const n = Number(/^(\d+)/.exec(found ?? '')?.[1] ?? NaN);
  t.step('type something that matches nothing');
  await t.page.keyboard.press('Control+A');
  await t.page.keyboard.type('zzzzqx', { delay: 40 });
  const none = await t.until(async () => (await live(t.page)).find((x) => /^No results for /.test(x)), 8000);
  return {
    pass: !!found && n === tiles && !!none,
    note: `Narrator search announced "${found}" with ${tiles} book link(s) on screen; nonsense search announced "${none}"`,
  };
});

const dialogFocus = defineTask('sam-dialogs-return-focus', 'Closing the shortcuts list or the sign-out question returns focus to the account button', async (t) => {
  await goHome(t);
  const account = (f) => f.role === 'button' && /^Account:/.test(f.name);
  t.step('Tab to the account button and open it');
  if ((await tabTo(t.page, account)) < 0) return { pass: false, note: 'Tab never reached the account button' };
  await t.page.keyboard.press('Enter');
  t.step('Tab to "Keyboard shortcuts" and press Enter');
  if ((await tabTo(t.page, (f) => f.name === 'Keyboard shortcuts', 5)) < 0) return { pass: false, note: 'The account menu has no reachable "Keyboard shortcuts"' };
  await t.page.keyboard.press('Enter');
  await t.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 });
  t.step('press Escape');
  await t.page.keyboard.press('Escape');
  await sleep(500);
  const a = (await snapshot(t.page)).focus;
  t.step('open the account menu, choose Sign out, then Stay signed in');
  await t.page.keyboard.press('Enter'); // focus is on the account button: opens its menu again
  if ((await tabTo(t.page, (f) => f.name === 'Sign out', 5)) < 0) return { pass: false, note: 'The account menu has no reachable "Sign out"' };
  await t.page.keyboard.press('Enter');
  await t.page.getByRole('dialog', { name: 'Sign out of Storyshelf?' }).waitFor({ state: 'visible', timeout: 5000 });
  const inDialog = (await snapshot(t.page)).focus;
  await t.page.keyboard.press('Enter'); // the dialog's first control is the safe one: "Stay signed in"
  await sleep(500);
  const b = (await snapshot(t.page)).focus;
  const signedIn = !/sign-in/.test(t.page.url());
  return {
    pass: account(a) && account(b) && signedIn,
    note: `After Escape on the shortcuts list focus is ${a.role} "${a.name}"; the sign-out dialog opened with focus on ${inDialog.role} "${inDialog.name}"; after pressing it focus is ${b.role} "${b.name}" and the user is ${signedIn ? 'still signed in' : 'signed out'}`,
  };
});

const routeAnnounced = defineTask('sam-route-change-announced', 'Going to Settings by keyboard moves focus to the page and announces its title', async (t) => {
  await goHome(t);
  t.step('Tab to the Settings tab');
  if ((await tabTo(t.page, (f) => f.role === 'link' && f.name === 'Settings')) < 0) return { pass: false, note: 'Tab never reached the Settings link' };
  t.step('press Enter');
  await t.page.keyboard.press('Enter');
  await t.page.waitForURL(/\/settings/);
  const said = await t.until(async () => (await live(t.page)).find((x) => /^Settings/.test(x)), 5000);
  const { focus } = await snapshot(t.page);
  return { pass: !!said && focus.role === 'main', note: `Announced "${said}"; focus is on ${focus.role} "${focus.name}"` };
});

const names = defineTask('sam-every-control-has-a-name', 'On the library, a book page and the player, no button, link or field is unnamed (from the browser\'s accessibility tree)', async (t) => {
  const books = await t.abs.books();
  const unnamed = [];
  const scan = async (label) => {
    const tree = await t.page.locator('body').ariaSnapshot();
    for (const line of tree.split('\n')) {
      // `- button "Play"` is named; `- button` or `- button [disabled]` is not.
      if (/^\s*- (button|link|slider|combobox|checkbox|radio|textbox|searchbox|switch|tab)(?: \[[^\]]*\])*(?::|$)/.test(line)) unnamed.push(`${label}: ${line.trim()}`);
    }
  };
  t.step('look at the library');
  await goHome(t);
  await scan('library');
  t.step('look at a book page');
  await t.go(`/book/${books[0].id}`);
  await t.page.getByRole('heading', { level: 1 }).first().waitFor();
  await sleep(800);
  await scan('book');
  t.step('look at the player');
  await t.go('/now-playing');
  await sleep(1500);
  if (/now-playing/.test(t.page.url())) await scan('player');
  return { pass: unnamed.length === 0, note: unnamed.length ? `Unnamed: ${unnamed.slice(0, 6).join(' | ')}` : 'No unnamed buttons, links or fields on the three pages' };
});

const textContrast = defineTask('sam-text-contrast-measured', 'Text on the library and the settings page meets WCAG AA (4.5:1, or 3:1 for large text), measured from computed colours', async (t) => {
  const failures = [];
  let measured = 0;
  let unmeasured = 0;
  for (const path of ['/', '/settings']) {
    t.step(`measure text contrast on ${path}`);
    await t.go(path);
    await sleep(2500);
    const r = await contrast(t.page);
    unmeasured += r.unmeasured;
    measured += r.samples.length;
    for (const s of r.samples) if (s.ratio < s.need) failures.push(`${path} "${s.text}" ${s.fg} on ${s.bg} = ${s.ratio}:1 (needs ${s.need}, ${s.px}px)`);
  }
  return {
    pass: failures.length === 0 && measured > 0,
    note: `${measured} distinct text colour/background pairs measured, ${unmeasured} text runs on images or gradients not measured. ${failures.length ? 'Below AA: ' + failures.slice(0, 5).join(' | ') : 'All at or above AA'}`,
  };
});

const zoom = defineTask('sam-zoom-200-400', 'At the width a 200% and 400% zoom leaves, the library and player have no sideways scroll and keep their main controls', async (t) => {
  t.onDone(() => t.page.setViewportSize({ width: 1440, height: 900 }));
  const results = [];
  // A browser at 200% zoom on a 1440x900 window gives the page 720x450 CSS pixels; at 400%, 360x225. Height is left roomier
  // than that so a phone-sized stack can be seen: this measures the layout, not the browser's own zoom control.
  for (const [pct, width, height] of [[200, 720, 450], [400, 360, 600]]) {
    t.step(`zoom to ${pct}%`);
    await t.page.setViewportSize({ width, height });
    for (const path of ['/', '/now-playing']) {
      await t.go(path);
      await sleep(1800);
      if (path === '/now-playing' && !/now-playing/.test(t.page.url())) continue; // no restored book on a new account
      const over = await t.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      const play = path === '/now-playing' ? await t.page.getByRole('button', { name: /^(Play|Pause)$/ }).first().isVisible() : true;
      results.push({ pct, path, over, play });
    }
  }
  const bad = results.filter((r) => r.over > 1 || !r.play);
  return {
    pass: bad.length === 0,
    note: bad.length ? `Problems: ${bad.map((r) => `${r.pct}% ${r.path}: ${r.over > 1 ? r.over + 'px of sideways scroll' : ''}${r.play ? '' : ' no Play/Pause in view'}`).join('; ')}` : `No sideways scroll at ${results.map((r) => r.pct + '% ' + r.path).join(', ')}`,
  };
});

export const tasks = [skipLink, playFocusLive, searchCount, dialogFocus, routeAnnounced, names, textContrast, zoom];

export const notCovered = [
  'what a real screen reader (NVDA, VoiceOver, JAWS) says: names, roles and live-region text are read from the browser, but speech, verbosity and timing are not',
  'the browser\'s own zoom and text-only zoom: layout is checked at the width a zoom leaves, by resizing the window',
  'contrast of text over cover art and gradients, and of icons, borders and focus rings (only text on plain backgrounds is measured)',
  'visible focus indicator quality (that it exists and is clear is a screenshot judgement)',
  'Windows high-contrast mode and forced colours',
  'whether announcements arrive in the right order and without chatter (timing is not observable here)',
];
