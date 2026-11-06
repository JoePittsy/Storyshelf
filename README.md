# Storyshelf

A listening-first web app for [Audiobookshelf](https://www.audiobookshelf.org) (ABS). ABS stays your server for the library, scanning and metadata; Storyshelf is where you listen. It is an installable PWA, built for the desktop browser and the iPhone Home Screen alike.

<!-- Screenshot: add docs/screenshot.png and replace this line with ![Storyshelf](docs/screenshot.png) -->
_Screenshot to follow._

- Pick up where you left off, with your place kept in sync through ABS so any device resumes in the same spot.
- Browse and search your library by book, author, narrator and series.
- Chapter-aware playback: book, chapter and sleep progress views, speed, and a sleep timer that can stop at the end of the chapter.
- History in the player: jump back to where earlier sessions started and stopped, or to where you were before a skip.
- A History page of what you have listened to and finished, with listening stats.
- Settings: your account, which library to use, how far the skip buttons move, and the keyboard shortcuts.

Storyshelf needs ABS 2.26.0 or later with local (username and password) sign-in enabled.

## Use it

### Hosted

Open **https://storyshelf.joepitts.co.uk** and enter your ABS server's address. Your browser talks to your server directly; nothing passes through Storyshelf.

Your ABS server must:

- be reachable over **HTTPS** (a browser will not let an HTTPS page call a plain HTTP server);
- allow Storyshelf's origin: in ABS, go to **Settings → Security → CORS allowed origins** and add `https://storyshelf.joepitts.co.uk`.

### Self-hosted with Docker

Run Storyshelf next to ABS. The container serves the app and forwards ABS's paths (`/api`, `/login`, `/logout`, `/auth`, `/status`, `/public`) to it, so the browser only ever talks to one origin and no CORS set-up is needed. Images are published for `linux/amd64` and `linux/arm64` (a Raspberry Pi works).

```yaml
services:
  audiobookshelf:
    image: ghcr.io/advplyr/audiobookshelf:latest
    volumes:
      - ./audiobooks:/audiobooks
      - ./podcasts:/podcasts
      - ./config:/config
      - ./metadata:/metadata
    restart: unless-stopped

  storyshelf:
    image: ghcr.io/joepittsy/storyshelf:latest
    environment:
      # ABS's address as seen from the Storyshelf container.
      ABS_UPSTREAM: http://audiobookshelf:80
    ports:
      - "8080:80"
    depends_on:
      - audiobookshelf
    restart: unless-stopped
```

Serve Storyshelf over HTTPS, for example behind your existing reverse proxy: ABS marks its refresh cookie `Secure`, so sign-in does not persist over plain HTTP except on `localhost`. Pin a version (for example `ghcr.io/joepittsy/storyshelf:1.0.0`) instead of `latest` if you prefer to upgrade by hand.

## Development

You need Node 24 and pnpm (`corepack enable` picks up the version in `package.json`).

```sh
pnpm install
```

Point the dev server at an ABS server in `apps/web/.env.local` (gitignored):

```
ABS_URL=https://your-abs-host
```

```sh
pnpm --filter @storyshelf/web dev      # http://localhost:5173
```

No ABS server to hand? [`e2e/`](e2e/README.md) runs a throwaway one in Docker on `http://localhost:13378`, with a few public-domain LibriVox audiobooks and two users; set `ABS_URL=http://localhost:13378` to use it.

Checks, as CI runs them:

```sh
pnpm -r typecheck
pnpm lint
pnpm -r test                           # the ui story tests need: pnpm --filter @joepittsy/ui exec playwright install chromium
pnpm --filter @storyshelf/web build
```

The repository is a pnpm workspace:

| Path | What |
| --- | --- |
| [`apps/web`](apps/web/README.md) | The Storyshelf app (Vite, React) and its Docker image |
| [`packages/ui`](packages/ui/README.md) | `@joepittsy/ui`, the design system: tokens, components and Storybook |
| [`e2e`](e2e/README.md) | A local ABS server for end-to-end testing |

Releases are cut by pushing a `vX.Y.Z` tag on `main`: the release workflow runs the checks, publishes the Docker image, creates the GitHub Release and updates the hosted site.

## Licence

Storyshelf, including `@joepittsy/ui`, is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). If you run a modified version for other people over a network, you must offer them its source.

## Credits

- [Audiobookshelf](https://github.com/advplyr/audiobookshelf) by advplyr and contributors, the server Storyshelf is built for. Storyshelf is an independent client and is not affiliated with the Audiobookshelf project.
- The design system began as the design layer of TrueTunes by [TrueNorth IT](https://github.com/TrueNorthIT), used with permission; see [`packages/ui/FORKED_FROM.md`](packages/ui/FORKED_FROM.md).
- [Manrope](https://github.com/sharanda/manrope) (SIL Open Font Licence 1.1), via Fontsource, and [Lucide](https://lucide.dev) icons (ISC).
- The e2e test library uses public-domain recordings from [LibriVox](https://librivox.org), downloaded from archive.org by a script and not stored in this repository.
