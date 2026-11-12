# Local Audiobookshelf for e2e tests

A throwaway Audiobookshelf (ABS) server in Docker, pinned to 2.37.2 to match the real
server, with a handful of public-domain LibriVox audiobooks from archive.org.

## Set up

From this folder (Git Bash on Windows is fine). Needs Docker, `curl`, `jq` and `openssl`;
the stand-in books also need Python 3 with Pillow, and `ffmpeg`.

```sh
./up.sh                 # everything below in one go; ABS on http://localhost:13378
```

`up.sh` is safe to re-run. In order, it:

1. starts the Docker daemon if it isn't running and it can (as root, with `dockerd` installed);
2. pulls the ABS image, falling back to the same tag on Docker Hub if ghcr.io's blob host is blocked;
3. runs `./fetch-books.sh`, or, if archive.org can't be reached, `./stand-in-books.py` (see below);
4. starts ABS (`docker compose up -d`), runs `./init.sh`, then `./seed-progress.sh` and `./seed-personas.sh`;
5. with `--app`, builds the web app and serves it next to ABS (see "The production build" below).

`--stand-in` skips archive.org and makes the stand-in books. `--both` gives the library the LibriVox books *and*
the stand-in books (see "Both kinds of book"). `--no-seed` leaves root and the personas with no listening
history. `--app` also serves the production build. The steps also run on their own:

```sh
./fetch-books.sh        # ~170 MB into data/audiobooks; re-runs skip existing files
docker compose up -d    # ABS on http://localhost:13378
./init.sh               # root user, library, scan, second user, persona users; writes .env
./seed-progress.sh      # root: one book finished, four part-way through
./seed-personas.sh      # each persona back to its starting state (--only <name> for one)
```

`init.sh` talks only to the ABS HTTP API. It generates every password and writes them to
`.env` (gitignored; `.env.example` lists the keys). It is safe to re-run: steps already
done are skipped, it keeps any other lines already in `.env`, and it rescans the library and
prints a summary each time. If a persona user already exists in ABS but `.env` has no password
for it, it sets a new password through the admin API (`PATCH /api/users/<id>`) and records it.

`seed-progress.sh` gives root some history, so the Library's hero, Continue listening, series
progress and the mini player have something to show: the first book by title finished, the
next four part-way through (the last of them is the most recent, so it's the hero). It does
nothing if root already has progress.

To use the app against it with the dev server, put `ABS_URL=http://localhost:13378` in `apps/web/.env.local`
and run `pnpm --filter @storyshelf/web dev`.

## The production build

```sh
./up.sh --app
```

builds `apps/web` (`pnpm --filter @storyshelf/web build`, from the repo root, so `pnpm install` must have run)
and starts a second container, `storyshelf-e2e-web`, on **http://localhost:18080**. It is the real production
setup, not the dev server: the repo's own nginx config (`apps/web/nginx/default.conf.template`, which proxies
`/api`, `/login` and the rest to ABS) serving the built `apps/web/dist`, and so the **service worker**. The page
is plain HTTP on `localhost`, which browsers treat as a secure context, so the worker registers; that is what
offline and install behaviour need and the dev server (which never registers a worker) can't show.

It is a compose service in the `app` profile, so a plain `docker compose up -d` still starts ABS alone. It
mounts the template and `dist` into the stock `nginx:alpine` image instead of building `apps/web/Dockerfile`,
because that build needs registry access from inside a Docker build, which many sandboxes block.

Run `./up.sh --app` again after a code change: it rebuilds `dist` and nginx serves the new files with no
restart. (A bind mount follows the directory, so if `dist` itself is deleted and recreated, rather than
emptied as the build does, the container sees nothing; `up.sh` checks for that and restarts the service.)

## Both kinds of book

The two sets cover different things, and a machine used to have one or the other. `./up.sh --both` fetches
the LibriVox books (multi-file books, a book with no chapters, accented author and title) and then also
runs `./stand-in-books.py` (long chaptered books, narrators, covers across the colour wheel), so the library
holds both. If archive.org can't be reached it makes the stand-in books only and says so. Without the flag
nothing changes: LibriVox if archive.org answers, otherwise the stand-ins, and neither if either is already
there. `stand-in-books.py` skips any book that already exists, so it is safe to run on a library that has
them, and next to LibriVox books.

To start again from nothing:

```sh
docker compose down
rm -rf data/config data/metadata .env   # keep data/audiobooks to avoid re-downloading
./up.sh
```

## What's in the library

| Folder | Covers |
| --- | --- |
| `Beatrix Potter/The Tale of Peter Rabbit and Others` | 18 MP3s, 2–28 min each: file-to-file transitions, chapter navigation; no narrator |
| `Honoré de Balzac/La Grande Bretèche {Nicholas Clifford}` | single M4B with 2 embedded chapters; accented author and title |
| `Arthur Conan Doyle/Sherlock Holmes/1 - The Adventure of the Blue Carbuncle {Phil Chenevert}` | series, sequence 1 |
| `Arthur Conan Doyle/Sherlock Holmes/2 - The Adventure of the Copper Beeches {Phil Chenevert}` | series, sequence 2 |
| `Margery Williams/The Velveteen Rabbit {Marlo Dianne}` | single untagged MP3 with no chapters; different narrator |

ABS reads author, series, sequence and title from the folder path, and the narrator from
`{…}` at the end of the title folder (LibriVox files have no narrator tag). The book list
and archive.org identifiers live in `fetch-books.sh`.

### Stand-in books

`stand-in-books.py` makes ten books for when archive.org can't be reached, or for looking at
colour: silent audio (6–15 h, 14–42 evenly spaced chapters, about 2 MB each) and made-up covers
spread across warm, cool, pale, near-black and saturated, so the UI's tint can be judged
against each kind of cover wash. They include two series, *The Ember Road* (3 books, warm
reds) and *Starfall* (2 books, deep blue and violet), and every book has a narrator.
They go into `data/audiobooks` alongside any LibriVox books.

## Users

| `.env` keys | Account |
| --- | --- |
| `ABS_E2E_USER` / `ABS_E2E_PASSWORD` | `root` (admin) |
| `ABS_E2E_USER2` / `ABS_E2E_PASSWORD2` | `e2e-user`, ordinary user, for multi-user and progress-isolation tests |
| `ABS_E2E_PERSONA_<NAME>_PASSWORD` | the persona users below, ordinary users (`<NAME>` is the name in capitals, for example `ABS_E2E_PERSONA_DAN_PASSWORD`) |

### Persona accounts

Seven ordinary users for the persona test agents (simulated users driving the app in a browser). `init.sh`
creates them; `seed-personas.sh` gives each its starting state. Unlike `seed-progress.sh`, it does not skip
a user who has history: every run deletes each persona's listening progress and bookmarks first, so a run
starts clean. `./seed-personas.sh --only dan` resets one. Books are chosen by their properties (length,
chapters), not by title, so any library works.

| Persona | Starting state |
| --- | --- |
| `margaret` | no listening history |
| `sam` | no listening history |
| `leo` | no listening history |
| `dan` | two books finished, two part-way; the most recent is a book with chapters |
| `priya` | every book finished except two, which are part-way |
| `ruth` | two books part-way |
| `joe` | one book part-way, with chapters |

## End-to-end tests

A small Playwright suite in `apps/web/e2e/` drives the real app (by default the Vite dev server, started for you on port 5185) against this server: signing in, resuming a book and keeping your place, the sleep timer, a double tap on the home shelf (phone only), search by narrator and signing out. It runs twice, as a desktop browser (1440×900) and as an iPhone 14 screen, both in Chromium.

Before running it:

```sh
./e2e/up.sh                                  # ABS on http://localhost:13378, and e2e/.env
pnpm --filter @storyshelf/web test:e2e
```

The suite stops with a message if `e2e/.env` is missing or ABS isn't answering on `/status`. Pass Playwright's usual arguments after the command, for example `-- --project=phone` or `-- e2e/sleep-timer.e2e.ts`.

- **Production build.** Set `E2E_BASE_URL` to run the same suite against an app that is already running, with no dev server started: after `./e2e/up.sh --app`, `E2E_BASE_URL=http://localhost:18080 pnpm --filter @storyshelf/web test:e2e`. That is the real nginx config, the production bundle and the service worker. Unset, nothing changes. The specs are the same for both and pass on both. (The tests still seed and check progress straight on ABS, on `ABS_E2E_URL`.)
- **CI.** `.github/workflows/e2e.yml` runs on pull requests and by hand: it starts everything with `./e2e/up.sh --both --app`, then runs the suite twice, on the dev server and on `http://localhost:18080`. It is a separate workflow, not part of `ci.yml`, so a Docker or archive.org problem can't block a release. On failure it prints the end of ABS's log and uploads `apps/web/test-results` as an artifact.
- **User.** Every test signs in as the ordinary user (`ABS_E2E_USER2`, `e2e-user`) and never touches root or anyone else. Before each test it **deletes that user's listening progress** over the ABS API and seeds two part-way books (the later one is the resume hero), so it passes on a fresh server and on a used one. Books are chosen by what they have (chapters, length, a narrator), not by title, so the LibriVox books and the stand-ins both work.
- **Timing.** The audio is real (silent on the stand-ins) and the position moves in real time, so the tests wait on the progress slider and the button names, never on fixed pauses. They run one at a time. A full run takes a few minutes.
- **Browser.** Playwright looks for its own Chromium (`pnpm --filter @storyshelf/web exec playwright install chromium`). If you have a different Chromium already, point `PLAYWRIGHT_CHROMIUM_PATH` at its executable instead, for example `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`.
- **Output.** Failure screenshots go to `apps/web/test-results/` (gitignored). Traces and video are off.

## Persona testing

`e2e/personas/` holds a kit for testing the app as seven made-up users (margaret, dan, priya, sam, leo, ruth, joe), each with their own ABS account, a browser profile that persists between runs, a fixed task list that gives a comparable scorecard, and a separate verifier for anything an agent finds. Run one persona's tasks with `node e2e/personas/run-tasks.mjs dan`. It needs the persona passwords in `e2e/.env` (`ABS_E2E_PERSONA_<NAME>_PASSWORD`). See [`personas/README.md`](personas/README.md).
