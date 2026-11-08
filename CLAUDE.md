# Storyshelf

A listening-first PWA for Audiobookshelf (ABS). pnpm workspace: `apps/web` (the app, Vite + React) and `packages/ui` (`@joepittsy/ui`, the design system). See `README.md`, `apps/web/README.md`, `packages/ui/README.md`.

## Getting changes into main

- Never push to `main` and never push tags. Work on a branch, push it, and open a PR into `main`. The owner merges.
- `apps/web/package.json`'s version decides whether merging releases:
  - Leave it alone: no release.
  - Bump it one step when asked to release (`cd apps/web && npm version patch|minor|major --no-git-tag-version`; `pnpm version` doesn't work here) and fill in the PR's `## Release notes`. Merging then tags `vX.Y.Z` and releases it: Docker image, GitHub Release with those notes, and the hosted site via the `release` branch.
  - A pre-release (`npm version 0.3.0-alpha --no-git-tag-version`; then `-alpha.1`, `-beta`, …, then `0.3.0`) releases as a GitHub pre-release and a Docker tag only: not `latest`, and not the hosted site.
  - The Release check enforces a single-step bump and the notes. The rules are in `.github/scripts/release.mjs`.
- Release notes are for users: short and plain, in sentence case, with no marketing tone. Follow the PR template (`.github/pull_request_template.md`).

## Checks (what CI runs)

```sh
pnpm -r typecheck
pnpm lint            # eslint, stylelint (design tokens only) and the DESIGN.md linter
pnpm format:check
pnpm --filter @storyshelf/web test
pnpm --filter @joepittsy/ui test        # unit + every story in Chromium with axe
pnpm --filter @storyshelf/web build
```

## Design system

- Colours, radii, type sizes and shadows come from tokens in `packages/ui/src/styles/global.css` and `depth.css`. Stylelint rejects raw values elsewhere.
- Every token is named in `packages/ui/DESIGN.md`, and `designSync.test.ts` fails if they drift. Read DESIGN.md before visual work.
- The palette is Slate: one low-saturation tint (`--tint`) mixed at low alpha, and colour comes from cover art. Don't reintroduce a saturated tint; it reads as purple.
- Design skills are vendored in `.claude/skills/` (impeccable, frontend-design).

## Seeing the app

- `./e2e/up.sh` starts a local ABS on `http://localhost:13378`, with books and listening history. It starts Docker if needed, uses Docker Hub if ghcr.io is blocked, and makes stand-in books if archive.org is blocked. Passwords are in `e2e/.env`.
- Put `ABS_URL=http://localhost:13378` in `apps/web/.env.local`, then run `pnpm --filter @storyshelf/web dev` (port 5173).
- Playwright and Chromium are available for screenshots. Sign in with the `e2e/.env` credentials.

## Icons

- `apps/web/icons/` holds the templates and `book-colours.json`, the colours users can pick for the icon.
- `icons/render.cjs` pre-renders `public/book/<id>/` and the default root icons. Rerun it after changing a template or the list (command in `apps/web/README.md`).
