// Dan: phone, one hand, 1.4x, sleep timer, chapters, car mode. Every task starts from a fresh page load of the library
// or the player in dan's own (persistent) profile, and puts back what it changed.
import { defineTask, poll, sleep } from '../lib/task.mjs';
import { position, tapTargets } from '../lib/session.mjs';
import {
  bookOnPlayer,
  bookToResume,
  chooseSleep,
  ensurePaused,
  goHome,
  openPlayerPage,
  pickChapter,
  pauseButton,
  playButton,
  press,
  resumeHero,
  sleepButton,
  sleepOff,
  sleepSecondsLeft,
  speedButton,
} from '../lib/ui.mjs';

/** Reads the position and the wall-clock time together, so a rate can be worked out from two samples. */
async function sample(page, duration) {
  const t0 = Date.now();
  const p = await position(page, { duration });
  return { p, t: (t0 + Date.now()) / 2 };
}

const resumeOneTap = defineTask('dan-resume-one-tap', 'Resume the current book from the library in one tap, and the position moves', async (t) => {
  const book = await bookToResume(t, { chapters: false });
  if (!book) return t.skip('dan has no book in progress on the server (run e2e/seed-personas.sh --only dan)');
  await goHome(t);
  t.step('tap the Resume button on the first screen');
  const label = await resumeHero(t);
  if (!label.includes(book.title)) return { pass: false, note: `The hero resumed "${label}", not the most recent book "${book.title}"` };
  const first = await sample(t.page, book.duration);
  await sleep(5000);
  const later = await sample(t.page, book.duration);
  const moved = later.p - first.p;
  return {
    pass: Number.isFinite(moved) && moved >= 3,
    note: `1 tap; position moved ${Number.isFinite(moved) ? moved.toFixed(1) : 'unreadable'} s in ${((later.t - first.t) / 1000).toFixed(1)} s of wall time`,
  };
});

const sleepBeforePlay = defineTask('dan-sleep-before-play', 'Set a 15-minute sleep timer before pressing Play: it is still armed, and counting down, while playing', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  t.onDone(async () => {
    await ensurePaused(t.page);
    await sleepOff(t);
  });
  t.step('open the sleep timer and pick 15 minutes');
  await chooseSleep(t, '15 minutes');
  const armed = await t.until(async () => (await sleepSecondsLeft(t.page)) > 14 * 60, 5000);
  if (!armed) return { pass: false, note: `After choosing 15 minutes the sleep button reads "${await sleepButton(t.page).getAttribute('aria-label')}"` };
  t.step('press Play');
  await press(t, playButton(t.page));
  const playing = await t.see(pauseButton(t.page), 15_000);
  if (!playing) return { pass: false, note: 'Play did not start playback within 15 s' };
  await sleep(3000);
  const left = await sleepSecondsLeft(t.page);
  const label = await sleepButton(t.page).getAttribute('aria-label');
  return {
    pass: left > 14 * 60 && left < 15 * 60,
    note: `Sleep button reads "${label}" while playing (expected between 14:00 and 15:00)`,
  };
});

const speed14 = defineTask('dan-speed-1-4', '1.4x speed applies (about 1.4 s of book per second) and is still set after a reload in the same profile', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  const book = await bookOnPlayer(t);
  t.onDone(async () => {
    await ensurePaused(t.page);
    if (!(await speedButton(t.page).getAttribute('aria-label').then((n) => /1\.0×/.test(n), () => true))) {
      await press(t, speedButton(t.page));
      await press(t, t.page.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '1.0×', exact: true }));
    }
  });
  t.step('open the speed control and set 1.4');
  await press(t, speedButton(t.page));
  await t.page.getByRole('slider', { name: 'Speed' }).fill('1.4');
  await t.page.keyboard.press('Escape');
  const named = await t.until(async () => /1\.4×/.test((await speedButton(t.page).getAttribute('aria-label')) ?? ''), 3000);
  if (!named) return { pass: false, note: `Speed button reads "${await speedButton(t.page).getAttribute('aria-label')}" after setting 1.4` };
  t.step('press Play');
  await press(t, playButton(t.page));
  if (!(await t.see(pauseButton(t.page), 15_000))) return { pass: false, note: 'Play did not start playback within 15 s' };
  await sleep(1500);
  const a = await sample(t.page, book.duration);
  await sleep(10_000);
  const b = await sample(t.page, book.duration);
  const rate = (b.p - a.p) / ((b.t - a.t) / 1000);
  t.step('pause, then reload the page');
  await press(t, pauseButton(t.page));
  await openPlayerPage(t);
  const after = await speedButton(t.page).getAttribute('aria-label');
  const rateOk = rate > 1.25 && rate < 1.55;
  const stays = /1\.4×/.test(after ?? '');
  return {
    pass: rateOk && stays,
    note: `Measured ${rate.toFixed(2)} s of book per second (want 1.25 to 1.55); after reload the speed button reads "${after}"`,
  };
});

const chapterUndo = defineTask('dan-chapter-undo', 'Jump to a chapter from the list, then Undo returns to within 2 s of the old place', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  const book = await bookOnPlayer(t);
  const chapters = await t.abs.chapters(book.id);
  const p0 = await position(t.page, { duration: book.duration });
  const target = chapters.findIndex((c) => c.start > p0 + 300);
  if (target < 0) return t.skip('the book has no chapter more than five minutes ahead of the current place');
  t.step(`open the chapter list and pick chapter ${target + 1}`);
  await pickChapter(t, target + 1);
  const there = await t.until(async () => Math.abs((await position(t.page, { duration: book.duration })) - chapters[target].start) <= 5, 8000);
  if (!there) return { pass: false, note: `After picking chapter ${target + 1} the position is ${await position(t.page, { duration: book.duration })}, not near ${chapters[target].start}` };
  const undo = t.page.getByRole('button', { name: 'Undo', exact: true }).first();
  if (!(await t.see(undo, 5000))) return { pass: false, note: 'No Undo appeared after jumping to a chapter' };
  t.step('press Undo');
  await press(t, undo);
  await sleep(500);
  const back = await position(t.page, { duration: book.duration });
  return { pass: Math.abs(back - p0) <= 2, note: `Was at ${p0}s, jumped to chapter ${target + 1} (${chapters[target].start}s), Undo went to ${back}s` };
});

const skipButtons = defineTask('dan-skip-30', 'Forward 30 and Back 30 move the place by 30 s each', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  const book = await bookOnPlayer(t);
  const p0 = await position(t.page, { duration: book.duration });
  t.step('press Forward 30 seconds');
  await press(t, t.page.getByRole('button', { name: 'Forward 30 seconds' }).first());
  await sleep(400);
  const p1 = await position(t.page, { duration: book.duration });
  t.step('press Back 30 seconds');
  await press(t, t.page.getByRole('button', { name: 'Back 30 seconds' }).first());
  await sleep(400);
  const p2 = await position(t.page, { duration: book.duration });
  return {
    pass: Math.abs(p1 - p0 - 30) <= 2 && Math.abs(p2 - p0) <= 2,
    note: `Place ${p0}s, after Forward ${p1}s, after Back ${p2}s`,
  };
});

const carMode = defineTask('dan-car-mode', 'Open car mode from the player: its Play target is at least 64 px, and it leaves again', async (t) => {
  await openPlayerPage(t);
  await ensurePaused(t.page);
  t.step('press Car mode');
  await press(t, t.page.getByRole('button', { name: 'Car mode' }).first());
  await t.page.waitForURL(/\/car$/, { timeout: 10_000 });
  const targets = await tapTargets(t.page);
  const play = targets.find((x) => x.name === 'Play');
  if (!play) return { pass: false, note: 'Car mode shows no button named Play' };
  t.step('press Close car mode');
  await press(t, t.page.getByRole('button', { name: 'Close car mode' }));
  const left = await t.until(async () => !/\/car$/.test(new URL(t.page.url()).pathname), 5000);
  return {
    pass: Math.min(play.hitW, play.hitH) >= 64 && !!left,
    note: `Play is ${play.w}x${play.h} (hit area ${play.hitW}x${play.hitH}); ${left ? 'closing returned to ' + new URL(t.page.url()).pathname : 'close did not leave car mode'}`,
  };
});

const playerTargets = defineTask('dan-player-targets', 'Every control on the phone player has a hit area of at least 44 x 44 px', async (t) => {
  await openPlayerPage(t);
  await sleep(1000); // the sheet slides in
  const targets = (await tapTargets(t.page)).filter((x) => x.name !== 'Skip to content' && !x.disabled);
  const small = targets.filter((x) => x.under44);
  return {
    pass: small.length === 0,
    note: `${targets.length} controls measured. ${small.length ? 'Under 44: ' + small.map((x) => `${x.role} "${x.name}" ${x.hitW}x${x.hitH}`).join('; ') : 'none under 44'}`,
  };
});

const reloadKeepsPlace = defineTask('dan-reload-keeps-place', 'Play, pause, reload: the place is where he paused, on the device and on the server', async (t) => {
  const book = await bookToResume(t, { chapters: false });
  if (!book) return t.skip('dan has no book in progress on the server');
  await goHome(t);
  t.step('tap Resume');
  await resumeHero(t);
  await sleep(4000);
  t.step('pause');
  await press(t, pauseButton(t.page));
  await playButton(t.page).waitFor({ state: 'visible' });
  const paused = await position(t.page, { duration: book.duration });
  const synced = await poll(async () => Math.abs((await t.abs.savedPosition(book.id)) - paused) <= 6, { timeout: 15_000 });
  t.step('reload the player');
  await openPlayerPage(t);
  const after = await position(t.page, { duration: book.duration });
  const server = await t.abs.savedPosition(book.id);
  return {
    pass: !!synced && Math.abs(after - paused) <= 6,
    note: `Paused at ${paused}s; server holds ${server}s; after reload the player shows ${after}s${synced ? '' : ' (the server did not catch up within 15 s)'}`,
  };
});

export const tasks = [resumeOneTap, sleepBeforePlay, speed14, chapterUndo, skipButtons, carMode, playerTargets, reloadKeepsPlace];

export const notCovered = [
  'hearing anything: the stand-in books are silent and Chromium here has no audio output, so "it plays" means the position advances',
  'lock-screen and AirPods controls, and the screen staying awake in car mode (no lock screen, no wake lock to observe)',
  'real iPhone Safari and the Home Screen app: this is Chromium with iPhone 14 touch and screen size',
  'one-handed reach (where the thumb can get to): target size is measured, reachability is not',
  'how it compares with Audible and the official ABS app (a judgement, not a check)',
];
