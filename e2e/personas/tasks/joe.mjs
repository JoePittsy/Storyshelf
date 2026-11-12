// Joe: the same account on a desktop tab and a phone at the same time. Two sessions, two persistent profiles
// (joe-desktop, joe-phone), both signed in as joe: `t` is the desktop and `await t.other()` is the phone.
// His server state is "one book part-way, with chapters" (e2e/seed-personas.sh). There is no second person here: the
// "other device" is always the phone session of this same run, so what is checked is the hand-off, not a stranger's write.
//
// Run as another account (until joe exists on a server): PERSONA_ACCOUNT=dan node run-tasks.mjs joe  (or --account dan)
import { defineTask, poll, sleep } from '../lib/task.mjs';
import { position } from '../lib/session.mjs';
import { bookToResume, ensurePaused, goHome, openPlayerPage, pauseButton, playButton, press, resumeHero } from '../lib/ui.mjs';

export const secondDevice = 'phone';

/** The phone session as a context the shared helpers understand (they want page, go and device). */
const onPhone = async (t) => {
  const s = await t.other();
  return { ...t, page: s.page, go: s.go, device: 'phone', context: s.context, session: s };
};

/** Parses the hero's "Resume · 9h 29m left: Title" into minutes left, or NaN. */
const minutesLeft = (text) => {
  const m = /Resume · (?:(\d+)h )?(\d+)m left/.exec(text) ?? /Resume · (\d+)h left/.exec(text);
  if (!m) return NaN;
  return /h left/.test(m[0]) && m.length === 2 ? Number(m[1]) * 60 : Number(m[1] ?? 0) * 60 + Number(m[2]);
};

const resumeOneTap = defineTask('joe-resume-one-tap', 'On the desktop, resume the current book from the first screen in one click, and it plays', async (t) => {
  const book = await bookToResume(t, { chapters: false });
  if (!book) return t.skip('joe has no book in progress on the server');
  await goHome(t);
  t.step('click Resume on the first screen');
  const label = await resumeHero(t);
  await sleep(1500);
  const a = await position(t.page, { duration: book.duration });
  await sleep(4000);
  const b = await position(t.page, { duration: book.duration });
  t.onDone(async () => ensurePaused(t.page));
  return { pass: label.includes(book.title) && b - a >= 3, note: `Hero said "${label}" (most recent book: "${book.title}"); position ${a}s then ${b}s` };
});

const heroMatchesServer = defineTask('joe-first-screen-matches-server', 'The first screen says how much is left and which chapter he is in, and the server agrees', async (t) => {
  const book = await bookToResume(t, { chapters: true });
  if (!book) return t.skip('joe has no in-progress book with chapters');
  await t.go('/');
  await t.page.getByRole('region', { name: 'Resume listening' }).waitFor({ state: 'visible', timeout: 20_000 });
  const region = t.page.getByRole('region', { name: 'Resume listening' });
  const action = (await region.getByRole('button', { name: /^Resume/ }).getAttribute('aria-label')) ?? '';
  const text = await region.innerText();
  const server = (await t.abs.progressOf(book.id)).currentTime;
  const chapters = await t.abs.chapters(book.id);
  const chapterNo = chapters.findIndex((c) => server >= c.start && server < c.end) + 1;
  const wantLeft = Math.round((book.duration - server) / 60);
  const shownLeft = minutesLeft(action);
  const chapterOk = text.includes(`Chapter ${chapterNo} of ${chapters.length}`);
  return {
    pass: action.includes(book.title) && Math.abs(shownLeft - wantLeft) <= 2 && chapterOk,
    note: `Button "${action}"; server says ${wantLeft} min left (page ${shownLeft}) and chapter ${chapterNo} of ${chapters.length} (${chapterOk ? 'page agrees' : 'page does not show it'})`,
  };
});

const pauseDesktopOpenPhone = defineTask('joe-pause-desktop-phone-matches', 'Play on the desktop, pause, then open the phone: Resume there picks up the same place', async (t) => {
  const book = await bookToResume(t, { chapters: true });
  if (!book) return t.skip('joe has no in-progress book with chapters');
  const phone = await onPhone(t);
  t.onDone(async () => {
    await ensurePaused(t.page);
    await ensurePaused(phone.page);
  });
  await goHome(t);
  t.step('desktop: Resume, listen a few seconds, pause');
  await resumeHero(t);
  await sleep(6000);
  await press(t, pauseButton(t.page));
  await playButton(t.page).waitFor({ state: 'visible' });
  const desktop = await position(t.page, { duration: book.duration });
  const synced = await poll(async () => Math.abs((await t.abs.savedPosition(book.id)) - desktop) <= 6, { timeout: 15_000 });
  t.step('phone: open the app and tap Resume');
  await goHome(phone);
  await resumeHero(phone);
  await sleep(1500);
  const there = await position(phone.page, { duration: book.duration });
  // Playing again rewinds a few seconds (at most 30 after a long pause), never forward.
  return {
    pass: !!synced && there <= desktop + 4 && there >= desktop - 31,
    note: `Desktop paused at ${desktop}s (server ${synced ? 'caught up' : 'did not catch up'}); phone after Resume is at ${there}s`,
  };
});

/** Opens the player on a device, plays about three seconds and pauses: now it has a session, like a tab used earlier in the day. */
async function listenBriefly(d) {
  await openPlayerPage(d);
  await ensurePaused(d.page);
  await press(d, playButton(d.page));
  await pauseButton(d.page).waitFor({ state: 'visible', timeout: 20_000 });
  await sleep(3000);
  await press(d, pauseButton(d.page));
  await playButton(d.page).waitFor({ state: 'visible' });
  await sleep(1500); // the pause sync reaches the server
}

/**
 * Both devices show the same book, paused. Then the phone moves on by `ahead` seconds and pauses, as in "he carried on
 * from his phone on the train". Returns where each device was and the place the server now holds.
 */
async function phoneMovesOn(t, ahead = 150) {
  const book = await bookToResume(t, { chapters: true });
  if (!book) return null;
  const phone = await onPhone(t);
  // Both start from the server's place. The desktop has listened a few seconds and paused, as a tab left open at a desk
  // has: it holds a session of its own, which is what makes it ask the server about a newer place.
  await listenBriefly(t);
  const start = await position(t.page, { duration: book.duration });
  await openPlayerPage(phone);
  await ensurePaused(phone.page);
  await press(phone, phone.page.getByRole('button', { name: 'Play', exact: true }).first());
  await pauseButton(phone.page).waitFor({ state: 'visible', timeout: 20_000 });
  for (let i = 0; i < ahead / 30; i++) await press(phone, phone.page.getByRole('button', { name: 'Forward 30 seconds' }).first());
  await sleep(2500);
  await press(phone, pauseButton(phone.page));
  await playButton(phone.page).waitFor({ state: 'visible' });
  const moved = await position(phone.page, { duration: book.duration });
  const synced = await poll(async () => Math.abs((await t.abs.savedPosition(book.id)) - moved) <= 6, { timeout: 15_000 });
  return { book, phone, start, moved, server: await t.abs.savedPosition(book.id), synced: !!synced };
}

/** What a person coming back to a tab does: the window gets focus. (The app also asks once a minute while visible.) */
const returnToTab = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

const phoneMovesDesktopOffers = defineTask('joe-phone-moves-desktop-offers-newer-place', 'Move on from the phone while the desktop tab sits paused: the desktop offers the newer place, taking it works, and Undo brings the old place back', async (t) => {
  t.step('both devices open on the same book, paused; the phone carries on 150 s and pauses');
  const s = await phoneMovesOn(t, 150);
  if (!s) return t.skip('joe has no in-progress book with chapters');
  t.onDone(async () => {
    await ensurePaused(t.page);
    await t.abs.setPlace(s.book, s.start);
  });
  if (!s.synced) return { pass: false, note: `The phone paused at ${s.moved}s but the server holds ${Math.round(s.server)}s` };
  t.step('desktop: come back to the tab');
  await returnToTab(t.page);
  const offer = t.page.getByRole('button', { name: /Jump/ }).first();
  const offered = await t.see(offer, 20_000);
  const text = offered ? ((await offer.getAttribute('aria-label')) ?? (await offer.innerText())) : '';
  if (!offered) {
    // The app also asks every minute: give it that long before calling it missing.
    const late = await t.see(offer, 70_000);
    if (!late) return { pass: false, note: `The phone moved to ${s.moved}s (server ${Math.round(s.server)}s) but the desktop tab, paused at ${s.start}s, never offered it within 90 s` };
  }
  t.step('desktop: click the offer');
  await offer.click();
  await sleep(700);
  const taken = await position(t.page, { duration: s.book.duration });
  const undo = t.page.getByRole('button', { name: 'Undo', exact: true }).first();
  const canUndo = await t.see(undo, 3000);
  t.step('desktop: press Undo');
  if (canUndo) await undo.click();
  await sleep(700);
  const back = await position(t.page, { duration: s.book.duration });
  return {
    pass: Math.abs(taken - s.server) <= 4 && canUndo && Math.abs(back - s.start) <= 2,
    note: `Offer: "${text.trim()}". Phone at ${s.moved}s, server ${Math.round(s.server)}s, desktop was ${s.start}s; after taking the offer ${taken}s; after Undo ${back}s`,
  };
});

const playTakesNewer = defineTask('joe-desktop-play-takes-newer-place', 'Press Play on the desktop tab after the phone has moved on: it picks up the phone\'s place and says so, with Undo', async (t) => {
  t.step('both devices open on the same book, paused; the phone carries on 150 s and pauses');
  const s = await phoneMovesOn(t, 150);
  if (!s) return t.skip('joe has no in-progress book with chapters');
  t.onDone(async () => {
    await ensurePaused(t.page);
    await t.abs.setPlace(s.book, s.start);
  });
  t.step('desktop: press Play without touching the offer');
  await press(t, playButton(t.page));
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 20_000 });
  const toast = t.page.getByText(/^Picked up where/).first();
  const said = await t.see(toast, 8000);
  const text = said ? await toast.innerText() : '';
  await sleep(1000);
  const now = await position(t.page, { duration: s.book.duration });
  return {
    pass: said && Math.abs(now - s.server) <= 8,
    note: `Phone left off at ${s.moved}s (server ${Math.round(s.server)}s), the desktop tab was at ${s.start}s; after Play it is at ${now}s; message: ${said ? '"' + text + '"' : 'none shown'}`,
  };
});

const desktopMovesPhoneOffers = defineTask('joe-desktop-moves-phone-offers-newer-place', 'The other way round: move on from the desktop while the phone sits paused: the phone offers the newer place', async (t) => {
  const book = await bookToResume(t, { chapters: true });
  if (!book) return t.skip('joe has no in-progress book with chapters');
  const phone = await onPhone(t);
  t.step('both devices open on the same book; the phone listens briefly and pauses');
  await listenBriefly(phone);
  const start = await position(phone.page, { duration: book.duration });
  await openPlayerPage(t);
  await ensurePaused(t.page);
  t.onDone(async () => {
    await ensurePaused(t.page);
    await ensurePaused(phone.page);
    await t.abs.setPlace(book, start);
  });
  t.step('desktop: play, skip forward 150 s, pause');
  await press(t, playButton(t.page));
  await pauseButton(t.page).waitFor({ state: 'visible', timeout: 20_000 });
  for (let i = 0; i < 5; i++) await t.page.getByRole('button', { name: 'Forward 30 seconds' }).first().click();
  await sleep(2500);
  await press(t, pauseButton(t.page));
  await playButton(t.page).waitFor({ state: 'visible' });
  const moved = await position(t.page, { duration: book.duration });
  const synced = await poll(async () => Math.abs((await t.abs.savedPosition(book.id)) - moved) <= 6, { timeout: 15_000 });
  if (!synced) return { pass: false, note: `The desktop paused at ${moved}s but the server holds ${Math.round(await t.abs.savedPosition(book.id))}s` };
  t.step('phone: come back to the app');
  await returnToTab(phone.page);
  const offer = phone.page.getByRole('button', { name: /Jump/ }).first();
  const offered = await t.see(offer, 90_000);
  const text = offered ? ((await offer.getAttribute('aria-label')) ?? (await offer.innerText())) : '';
  return { pass: offered, note: offered ? `Phone offered: "${text.trim()}" (desktop moved ${start}s to ${moved}s)` : `The desktop moved from ${start}s to ${moved}s but the phone, paused, offered nothing within 90 s` };
});

export const tasks = [resumeOneTap, heroMatchesServer, pauseDesktopOpenPhone, phoneMovesDesktopOffers, playTakesNewer, desktopMovesPhoneOffers];

export const notCovered = [
  'lock-screen resume: the iPhone lock screen, AirPods and the Control Centre buttons (no lock screen, and this is Chromium)',
  'a genuine second device: the phone is Chromium with iPhone 14 touch and screen size, so ABS may name it differently from a real iPhone',
  'hearing anything (silent stand-in audio, no audio output)',
  'the phone locked or the app backgrounded for hours before he moves on elsewhere: only a window focus event stands in for coming back',
  'both devices playing at the same moment (the "also playing" notice)',
  'his real library (several hundred books, real covers and metadata)',
];
