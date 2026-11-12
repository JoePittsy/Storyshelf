# Persona testing kit

Storyshelf is tested here the way people use it: a script drives the real app in a real browser as one of seven made-up users, each with their own ABS account, their own device and their own habits. It found two bugs that 1,361 unit tests missed. This kit makes that repeatable and less noisy:

- **Persistent browser profile per persona.** Per-device state (each book's speed, downloads, the restored player, the service worker) survives between runs, as it does on a real person's device. `--fresh` is how you say "a new device".
- **A fixed task list per persona.** The same 6 to 8 tasks, in the same order, each decided by an explicit check. They produce a scorecard that can be compared from one release to the next.
- **Findings with repros.** Anything found beyond the tasks is written down with a script that shows it (`exit 0` = seen, `1` = not).
- **A verifier.** A separate role re-runs every repro twice, then reads the code, before anything reaches the owner.

It is plain Node (`.mjs`), no dependencies of its own. Playwright and Chromium come from the workspace.

## Run one persona's tasks by hand

You need the app and Audiobookshelf running, and `e2e/.env` with the persona passwords (`ABS_E2E_PERSONA_<NAME>_PASSWORD`, see `e2e/README.md`).

```sh
node e2e/personas/run-tasks.mjs dan                          # the production build on http://localhost:18080
node e2e/personas/run-tasks.mjs dan --url http://localhost:5173   # the Vite dev server
node e2e/personas/run-tasks.mjs dan --fresh                  # a new device: wipe dan's phone profile first
node e2e/personas/run-tasks.mjs dan --only dan-skip-30       # one task
```

Options: `--url` (or `STORYSHELF_URL`), `--out <folder>`, `--account <abs user>` (or `PERSONA_ACCOUNT`), `--fresh`, `--only <task id>`.

- The persona is reset first with `e2e/seed-personas.sh --only <account>` if that script exists. If it doesn't, or you want another copy of it, set `PERSONA_SEED_SCRIPT=/path/to/seed-personas.sh`. Tasks that need a particular starting state say so and skip when it isn't there.
- Exit status is 0 when every task ran, even if some failed: a failed task is a result. It is 1 only when the harness itself broke (the app or ABS is down, or a task threw).
- Use the **production build** when you can. The dev server has no service worker, so tasks about downloads and the app opening offline skip there, with the reason in the scorecard.
- Run one persona at a time per profile: a browser profile can only be open once. Different personas can run together.
- `joe` uses two devices (a desktop tab and a phone) signed in as the same account. Until joe exists on a server, run him as another account: `node e2e/personas/run-tasks.mjs joe --account dan`. The profile is wiped when the account behind it changes, so nothing leaks between accounts.
- `PLAYWRIGHT_CHROMIUM_PATH` points at a Chromium Playwright can't find itself, for example `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`. Never run `playwright install` for this.

## Output

Each run writes to `e2e/personas/runs/<persona>-<time>/` (gitignored), or to `--out`:

```
scorecard.json     every task: id, title, pass, steps, seconds, note, scriptError, skipped; the console errors; the summary
scorecard.md       the same as a table
failed-<task>.png  a screenshot taken when a task did not pass
findings.json      written by a persona agent (see AGENT-BRIEF.md)
repros/            the agent's repro scripts
verified.json      written by verify-finding.mjs
```

A task has three outcomes that are kept apart on purpose: **pass/FAIL** (the app did or didn't do what the task expects), **skip** (it can't be run here, with the reason) and **SCRIPT ERROR** (the task's own code broke; never evidence about the app). Browser profiles live in `e2e/personas/.profiles/<persona>-<device>/` (gitignored); delete one to start that device over.

## The roles

1. A **persona agent** is given `AGENT-BRIEF.md` (with `{persona}`, `{account}`, `{device}`, `{url}`, `{out}` filled in) and `personas/<name>.md`. It runs the tasks, explores for at most 60 actions, and writes findings with repros.
2. The **verifier** is given `VERIFIER-BRIEF.md` and a findings file. It runs `node e2e/personas/verify-finding.mjs <findings.json>` (each repro twice, in fresh processes: `confirmed`, `flaky`, `not-reproduced`, `script-error`), reads the code for the confirmed ones, and returns one table with `bug`, `by-design` or `test-artefact` for each.
3. Only verified findings go to the owner. The findings format and rules are in the findings section of `AGENT-BRIEF.md`.

## What is in the folder

```
run-tasks.mjs          runs a persona's tasks, writes the scorecard
verify-finding.mjs     runs a findings file's repros twice and classifies them
AGENT-BRIEF.md         instructions for a persona agent (includes the findings format and its rules)
VERIFIER-BRIEF.md      instructions for the verifier
personas/<name>.md     the persona: front matter (name, account, device, model, tasks) and the brief
tasks/<name>.mjs       the persona's tasks, plus `notCovered`
lib/pw.mjs             finds Playwright (below)
lib/env.mjs            e2e/.env and the environment variables
lib/session.mjs        openSession: the persistent profile, sign-in, errors; re-exports the probes
lib/probes.mjs         snapshot, position, tapTargets, contrast, shot
lib/abs.mjs            a small ABS client: choose books by property, read your own progress and bookmarks
lib/ui.mjs             the accessible names the app uses, and common moves (resume, open the player, sleep timer)
lib/task.mjs           defineTask and polling
lib/persona.mjs        reads personas/<name>.md
```

### How the scripts get Playwright

`e2e/` has no `package.json`, so a plain `import 'playwright'` would not resolve. `lib/pw.mjs` does what Node would do from `apps/web`: `createRequire(<repo>/apps/web/package.json)('@playwright/test')`, which gives the workspace's Playwright 1.64.1 (`chromium`, `devices`). Run `pnpm install` once at the repo root. Nothing is added to any `package.json`.

### The helpers

`openSession({ persona, device, fresh })` returns `{ context, page, errors, close, go, url, account, out }`. `device` is `desktop` (1440×900) or `phone` (the iPhone 14 descriptor forced onto Chromium, touch on). It signs in through the real form only if the app shows it, and collects console and page errors (ignoring the one expected `401` at sign-in).

- `snapshot(page)`: the visible text of `main` and of the "Now playing" region, the text of every `[role=status]`, `[role=alert]` and `[aria-live]` element (including visually hidden ones, because that is the point of a live region), and the role and name of the focused element as the browser computes them.
- `position(page, { duration })`: where the book is, in seconds, read from the progress slider. The slider only counts from the start of the book in the "Whole book" window; in "This chapter" it counts from the chapter, and an armed sleep timer turns it into a progressbar reading "Stops in 14:52". So on the player page it selects "Whole book", reads, and puts the previous choice back. On the mini player alone it trusts the text only if the total matches `duration`, and returns `NaN` rather than a wrong number.
- `tapTargets(page)`: every visible button, link and field with its name and size. Some controls are small to look at but have a larger hit area made with a pseudo-element or padding. The hit area is therefore **measured, not read from CSS**: for any control under 44 px in either direction it samples `document.elementFromPoint` on a 2 px grid up to 24 px around it and takes the extent of the points that land on the control or something inside it (`hitW`, `hitH`). `under44` is judged on that. Limits: controls outside the viewport can't be sampled (they report `measured: false` and their visible box stands), a control something else overlaps reads smaller than it is, and the accessible name is a close approximation, not the browser's own algorithm. 44 px is PRODUCT.md's bar for the phone; on desktop it is information.
- `contrast(page)`: the contrast ratio of every distinct text colour against what is behind it, from computed styles composited down the ancestors (any colour format, via a canvas). Text over images or gradients is counted as not measured, not guessed.
- `shot(page, name)`: a screenshot into the run's output folder at CSS-pixel scale (device scale 1, so a phone's 3× ratio doesn't triple the file).

## Add a persona or a task

**A task** is a small function that drives the app and returns one record. In `tasks/<persona>.mjs`:

```js
import { defineTask } from '../lib/task.mjs';
import { goHome, resumeHero } from '../lib/ui.mjs';

const resume = defineTask('dan-resume-one-tap', 'Resume the current book in one tap', async (t) => {
  await goHome(t);
  t.step('tap Resume');                      // counts one thing the person did
  await resumeHero(t);
  return { pass: await t.see(pauseButton(t.page)), note: 'what you measured' };
});
export const tasks = [resume];
export const notCovered = ['what this list can't check here'];
```

- Decide `pass` with an explicit check. Never "nothing threw". Say what you measured in `note`.
- Anything thrown is a script error, not a product failure. A task that wants a missing control to count as a product failure checks for it (`t.see`) and returns `{ pass: false, note }`.
- `return t.skip('reason')` when the task can't be run here. Give the real reason.
- Choose books **by property** (has chapters, in progress, unstarted: `lib/abs.mjs`), never by title: the library may be the LibriVox set or the stand-ins.
- Poll (`t.until`, `expect.poll` style), don't sleep for a result; sleeping is for letting real time pass, such as measuring a speed.
- Put back what the task changed with `t.onDone(...)` (a timer, a speed, a bookmark): tasks must be re-runnable.
- Leave out what can't be checked and list it in `notCovered`. Do not fake it.
- `t` is the run context: `page`, `go(path)`, `abs`, `device`, `persona`, `reopen()` (close and reopen the browser on the same profile), `other()` (the second device of a two-device persona), `hasServiceWorker()`.

**A persona** is `personas/<name>.md` with front matter `name`, `account`, `device`, `model` and `tasks`, then the brief: who they are, what they care about, what they compare with, how they behave, the rules for playing them. Add the ABS account to `e2e/init.sh` and a start state to `e2e/seed-personas.sh`.

## Limits

- **No audio.** The stand-in books are silent and there is no sound output, so "it plays" means "the position moves". Nothing can be said about how it sounds.
- **Chromium only.** No Safari or WebKit. The phone is Chromium with the iPhone 14's screen, pixel ratio, user agent and touch: it is not iOS (no iOS audio, no Home Screen app, no iOS storage limits or page lifecycle).
- **No lock screen, AirPlay, Bluetooth, AirPods or Control Centre.** Lock-screen resume can't be tested here.
- **One machine, one network.** Offline is the browser's switch (or a failed request), not a weak signal.
- **Zoom is emulated** by the window width a zoom leaves, not the browser's own zoom.
- **Dev server versus production.** Offline and install behaviour need the production build; the dev server has no service worker.
- Each persona's `notCovered` export says what its own tasks leave out, and it is copied into the scorecard.
