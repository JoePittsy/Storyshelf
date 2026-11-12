// Ruth: phone, in bed, a sleep timer every night, bookmarks, downloads for a staff room with no signal. Her server state is
// "two books part-way" (e2e/seed-personas.sh). Tasks use the book the player has loaded and put back what they change.
import { defineTask, sleep } from '../lib/task.mjs';
import { contrast, position } from '../lib/session.mjs';
import {
  bookOnPlayer,
  chooseSleep,
  escapeRe,
  ensurePaused,
  goHome,
  openPlayerPage,
  openSheet,
  pickChapter,
  pauseButton,
  playButton,
  press,
  serviceWorkerReady,
  tapAt,
  sleepButton,
  sleepOff,
  sleepSecondsLeft,
  speedButton,
} from '../lib/ui.mjs';

const label = (page, loc) => loc.getAttribute('aria-label');

/** Opens the player on the book it has, with chapters; skips the task if that book has none. */
async function playerWithChapters(t) {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  const book = await bookOnPlayer(t);
  if (book.chapters < 2) return { skip: `the book in the player ("${book.title}") has no chapters` };
  return { book, chapters: await t.abs.chapters(book.id) };
}

const chapterTimer = defineTask('ruth-sleep-end-of-chapter', 'Set "End of chapter" for tonight: the button says so, a screen reader is told, and the time left matches the chapter', async (t) => {
  const r = await playerWithChapters(t);
  if (r.skip) return t.skip(r.skip);
  t.onDone(() => sleepOff(t));
  const p0 = await position(t.page, { duration: r.book.duration });
  const rateText = (await label(t.page, speedButton(t.page))) ?? '';
  const rate = Number(/(\d+(?:\.\d+)?)×/.exec(rateText)?.[1] ?? 1);
  const chapter = r.chapters.find((c) => p0 >= c.start && p0 < c.end);
  t.step('tap the moon and choose End of chapter');
  await chooseSleep(t, 'End of chapter');
  const name = await t.until(async () => /End of chapter/.test((await label(t.page, sleepButton(t.page))) ?? ''), 3000);
  const m = /End of chapter, (?:(\d+):)?(\d+):(\d{2})$/.exec((await label(t.page, sleepButton(t.page))) ?? '');
  const shown = m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
  const expected = (chapter.end - 0.5 - p0) / rate;
  const said = await t.until(async () => (await t.page.locator('[role=status]').allTextContents()).some((x) => /^Sleep timer: end of chapter/.test(x.trim())), 3000);
  return {
    pass: !!name && !!said && Math.abs(shown - expected) <= 5,
    note: `Button reads "${await label(t.page, sleepButton(t.page))}" (time left ${shown}s, chapter says ${Math.round(expected)}s at ${rate}x); announced "Sleep timer: end of chapter": ${!!said}`,
  };
});

const addFifteen = defineTask('ruth-sleep-add-15', 'Set 5 minutes, then Add 15 minutes: the timer reads about 20 minutes and says so', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  t.onDone(() => sleepOff(t));
  t.step('tap the moon and choose 5 minutes');
  await chooseSleep(t, '5 minutes');
  const five = await t.until(async () => (await sleepSecondsLeft(t.page)) > 4 * 60, 3000);
  t.step('tap the moon and choose Add 15 minutes');
  await chooseSleep(t, 'Add 15 minutes');
  await sleep(500);
  const left = await sleepSecondsLeft(t.page);
  const said = await t.until(async () => (await t.page.locator('[role=status]').allTextContents()).some((x) => /^Sleep timer: 20 minutes/.test(x.trim())), 3000);
  return {
    pass: !!five && left > 19 * 60 && left <= 20 * 60 && !!said,
    note: `After 5 minutes the button read ${five ? 'about 5:00' : 'something else'}; after Add 15 minutes it reads "${await label(t.page, sleepButton(t.page))}"; announced "Sleep timer: 20 minutes": ${!!said}`,
  };
});

const bookmarks = defineTask('ruth-bookmark-add-rename-jump-delete', 'Add a bookmark, rename it, jump back to it from elsewhere, delete it: the screen and the server agree at each step', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  const book = await bookOnPlayer(t);
  await t.abs.clearBookmarks(book.id);
  t.onDone(() => t.abs.clearBookmarks(book.id));
  const p0 = await position(t.page, { duration: book.duration });
  t.step('open Bookmarks and press the Bookmark button');
  let sheet = await openSheet(t, 'Bookmarks');
  await sheet.getByRole('button', { name: /^Bookmark \d/ }).click();
  const added = await t.until(async () => (await t.abs.bookmarks(book.id)).length === 1, 8000);
  const server1 = (await t.abs.bookmarks(book.id))[0];
  const said = await t.see(sheet.getByText(/^Bookmark added at/).or(sheet.locator('[role=status]').filter({ hasText: /Bookmark added at/ })), 3000).catch(() => false);
  t.step('rename it');
  await sheet.getByRole('button', { name: /^Rename / }).click();
  const dialog = t.page.getByRole('dialog', { name: 'Rename bookmark' });
  await dialog.getByLabel('Name').fill('Nurse test');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const renamed = await t.until(async () => (await t.abs.bookmarks(book.id))[0]?.title === 'Nurse test', 8000);
  t.step('close the sheet and skip forward a minute');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await press(t, t.page.getByRole('button', { name: 'Forward 30 seconds' }).first());
  await press(t, t.page.getByRole('button', { name: 'Forward 30 seconds' }).first());
  await sleep(400);
  t.step('open Bookmarks and choose the bookmark');
  sheet = await openSheet(t, 'Bookmarks');
  await sheet.getByRole('button', { name: /^Nurse test/ }).first().click();
  await sleep(600);
  const there = await position(t.page, { duration: book.duration });
  t.step('open Bookmarks and delete it');
  sheet = await openSheet(t, 'Bookmarks');
  await sheet.getByRole('button', { name: 'Delete Nurse test' }).click();
  const gone = await t.until(async () => (await t.abs.bookmarks(book.id)).length === 0, 8000);
  const undoShown = await t.see(sheet.getByRole('button', { name: 'Undo deleting Nurse test' }), 3000);
  return {
    pass: !!added && !!renamed && Math.abs(there - server1.time) <= 2 && !!gone && undoShown,
    note: `Added at ${p0}s (server ${server1?.time}s; confirmation shown: ${said}); renamed on the server: ${!!renamed}; jumping from ${p0 + 60}s landed at ${there}s; deleted on the server: ${!!gone}, Undo offered: ${undoShown}`,
  };
});

const historyJump = defineTask('ruth-history-jump-back', 'Jump a chapter ahead by mistake, then use History in the player to go back to where she was', async (t) => {
  const r = await playerWithChapters(t);
  if (r.skip) return t.skip(r.skip);
  const p0 = await position(t.page, { duration: r.book.duration });
  if (!r.chapters.some((c) => c.start > p0 + 120)) return t.skip('no chapter more than two minutes ahead');
  t.step('tap Next chapter');
  await press(t, t.page.getByRole('button', { name: 'Next chapter' }).first());
  await sleep(600);
  const moved = await position(t.page, { duration: r.book.duration });
  t.step('open History and tap the first "Go back" place');
  const sheet = await openSheet(t, 'History');
  const goBack = sheet.getByRole('button', { name: /^Go back: / }).first();
  if (!(await t.see(goBack, 8000))) return { pass: false, note: `After jumping from ${p0}s to ${moved}s the History sheet offers no "Go back" place` };
  const offered = await goBack.getAttribute('aria-label');
  await goBack.click();
  await sleep(600);
  const back = await position(t.page, { duration: r.book.duration });
  return { pass: Math.abs(back - p0) <= 3, note: `Was at ${p0}s, Next chapter took her to ${moved}s, History offered "${offered}" and tapping it put her at ${back}s` };
});

const fellAsleep = defineTask('ruth-find-where-she-dozed-off', 'The end-of-chapter timer pauses the book, and the player offers to go back to where the timer began', async (t) => {
  const r = await playerWithChapters(t);
  if (r.skip) return t.skip(r.skip);
  const rateText = (await label(t.page, speedButton(t.page))) ?? '';
  if (!/1\.0×/.test(rateText)) return t.skip(`the book plays at "${rateText}", and this task counts on real time at 1.0×`);
  // Start the night at the top of a chapter that is long enough to doze in (earlier tasks may have left the place anywhere).
  const n = r.chapters.findIndex((c) => c.end - c.start >= 600);
  if (n < 0) return t.skip('no chapter longer than ten minutes');
  t.step(`start the evening at the top of chapter ${n + 1}`);
  await pickChapter(t, n + 1);
  await sleep(600);
  const p0 = await position(t.page, { duration: r.book.duration });
  const chapter = r.chapters[n];
  t.onDone(async () => {
    await ensurePaused(t.page);
    await sleepOff(t);
    await t.page.getByRole('radio', { name: 'Whole book' }).click().catch(() => undefined);
  });
  t.step('set End of chapter (where she is now: she is awake)');
  await chooseSleep(t, 'End of chapter');
  t.step("(move the bar to 45 s before the end of the chapter: a seek counts as being awake, and the offer needs over 30 s of listening after it)");
  await t.page.getByRole('radio', { name: 'This chapter' }).click();
  const slider = t.page.getByRole('slider', { name: /^Progress through / });
  await slider.focus();
  await t.page.keyboard.press('End');
  // End lands on the very start of the next chapter, which is chapter 2's window: step back 45 s in the whole book.
  await t.page.getByRole('radio', { name: 'Whole book' }).click();
  await slider.focus();
  for (let i = 0; i < 9; i++) await t.page.keyboard.press("ArrowLeft");
  await sleep(500);
  t.step('press Play and wait for the timer');
  await press(t, playButton(t.page));
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 15_000 });
  const stopped = await t.see(playButton(t.page), 90_000);
  const offer = t.page.getByRole('button', { name: /^Go back to (where the timer began|the start of Chapter|Chapter \d|\d)/ }).first();
  const offered = await t.see(offer, 8000);
  if (!stopped || !offered) {
    const where = await position(t.page, { duration: r.book.duration });
    return {
      pass: false,
      note: `Timer paused the book: ${stopped}; offer to go back shown: ${offered}. Place now ${where}s (chapter ends at ${Math.round(chapter.end)}s, timer set at ${p0}s); sleep button "${await label(t.page, sleepButton(t.page))}"`,
    };
  }
  const text = await offer.getAttribute('aria-label').catch(async () => offer.innerText());
  t.step('tap the offer');
  await offer.click();
  await sleep(600);
  const back = await position(t.page, { duration: r.book.duration });
  const awakeAt = chapter.end - 45;
  return { pass: Math.abs(back - awakeAt) <= 3, note: `Last awake at about ${Math.round(awakeAt)}s (the last seek), the timer paused the book at the chapter end; the offer read "${text}"; tapping it put her at ${back}s` };
});

const downloadOffline = defineTask('ruth-download-then-play-offline', 'Download a book, switch the network off, reopen the app and play it (needs the production build\'s service worker)', async (t) => {
  await goHome(t);
  if (!(await serviceWorkerReady(t))) return t.skip('this build has no service worker (the Vite dev server never registers one), so the app cannot open with the network off; run against the production build (STORYSHELF_URL, default http://localhost:18080)');
  const books = (await t.abs.books()).filter((b) => b.progress && !b.progress.isFinished).sort((a, b) => a.duration - b.duration);
  const book = books[0];
  if (!book) return t.skip('ruth has no in-progress book to download');
  const removeDownload = async () => {
    await t.context.setOffline(false);
    await t.go(`/book/${book.id}`);
    const opts = t.page.getByRole('button', { name: /^Downloaded: .*Download options/ });
    if (await t.see(opts, 8000)) {
      await opts.first().click();
      await t.page.getByRole('button', { name: 'Remove download' }).click();
      await t.page.getByRole('dialog', { name: 'Remove the download?' }).getByRole('button', { name: 'Remove' }).click();
      await t.page.getByRole('button', { name: `Download ${book.title}`, exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    }
  };
  t.onDone(removeDownload);
  await removeDownload(); // start from "nothing downloaded", whatever an earlier run left on this device
  t.step('tap the Download button on the book page');
  await press(t, t.page.getByRole('button', { name: `Download ${book.title}`, exact: true }));
  const done = await t.until(async () => (await t.page.getByRole('button', { name: new RegExp(`^Downloaded: ${escapeRe(book.title)}`) }).count()) > 0, 240_000);
  if (!done) return { pass: false, note: `The download of "${book.title}" did not finish within four minutes` };
  t.step('network off, open the app');
  await t.context.setOffline(true);
  const opened = await t.page.goto(`${t.url}/`, { waitUntil: 'domcontentloaded' }).then(() => true, () => false);
  if (!opened) return { pass: false, note: 'With a service worker and a finished download, the app would not open with the network off' };
  const play = t.page.getByRole('button', { name: `Play ${book.title}`, exact: true });
  if (!(await t.see(play, 10_000))) return { pass: false, note: `Offline, the library has no "Play ${book.title}" for the downloaded book` };
  t.step('tap Play on the downloaded book');
  await tapAt(t.page, play);
  const playing = await t.see(pauseButton(t.page), 20_000);
  const a = await position(t.page, { duration: book.duration });
  await sleep(4000);
  const b = await position(t.page, { duration: book.duration });
  return { pass: playing && b - a >= 2, note: `Opened offline: ${opened}; playing: ${playing}; position ${a}s then ${b}s` };
});

const readable = defineTask('ruth-player-text-readable', 'On the player and the library, text meets WCAG AA contrast (measured), and the smallest text is reported', async (t) => {
  const bad = [];
  let smallest = Infinity;
  let measured = 0;
  for (const path of ['/now-playing', '/']) {
    t.step(`measure ${path}`);
    await t.go(path);
    await sleep(2500);
    const r = await contrast(t.page);
    measured += r.samples.length;
    for (const s of r.samples) {
      smallest = Math.min(smallest, s.px);
      if (s.ratio < s.need) bad.push(`${path} "${s.text}" ${s.ratio}:1 (needs ${s.need})`);
    }
  }
  return {
    pass: bad.length === 0 && measured > 0,
    note: `${measured} colour pairs measured; smallest text ${smallest}px. ${bad.length ? 'Below AA: ' + bad.slice(0, 4).join(' | ') : 'All at or above AA'}`,
  };
});

export const tasks = [chapterTimer, addFifteen, bookmarks, historyJump, fellAsleep, downloadOffline, readable];

export const notCovered = [
  'brightness: how it looks at the lowest screen brightness in a dark room (contrast ratios are measured, glare and dimming are not)',
  'hearing the book fade out as the timer ends (silent stand-in audio, no audio output)',
  'the screen locking or the app being closed overnight, and the "morning after" offer on a cold start',
  'a real staff room: only the browser\'s offline switch, so no weak-signal cases between "online" and "none"',
  'downloads on a real iPhone (iOS storage limits and its stopping a download when the app leaves the screen)',
  'whether she can find the moon icon by its picture (only that it has a name and works)',
];
