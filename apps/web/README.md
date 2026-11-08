# Storyshelf web

React PWA front end for a self-hosted [Audiobookshelf](https://www.audiobookshelf.org) (ABS) server. ABS stays the backend; Storyshelf needs ABS 2.26.0 or later with local sign-in enabled.

The browser only ever talks to Storyshelf's own origin. The dev server (Vite) and the production container (nginx) both forward `/api`, `/login`, `/logout`, `/auth`, `/status` and `/public` to ABS, so ABS's httpOnly refresh cookie belongs to Storyshelf's origin and no CORS is involved. (The hosted site is the exception; see Production.)

## Development

Create `apps/web/.env.local` (gitignored):

```
ABS_URL=https://your-abs-host
```

Then `pnpm --filter @storyshelf/web dev` and open http://localhost:5173.

Scripts: `typecheck`, `lint`, `test`, `build`.

## Production

The Docker image is published to `ghcr.io/joepittsy/storyshelf` on each release; the root [README](../../README.md#self-hosted-with-docker) has a Docker Compose file to run it next to ABS. `ABS_UPSTREAM` is the ABS address as seen from the Storyshelf container.

To build it yourself, from the repository root (the image needs the whole workspace):

```
docker build -f apps/web/Dockerfile -t storyshelf .
```

The build includes a service worker (`vite-plugin-pwa`) that keeps the app itself on the device, so the installed app opens with no network, signed in, showing what it last loaded (kept in IndexedDB). It never answers ABS's paths or keeps anything ABS sends. A new release takes over at the next launch, never while the app is open; see `src/pwa/serviceWorker.ts`. Whatever serves the build must not cache `/sw.js` or `index.html` for long (`public/_headers` and the nginx template send `no-cache`).

The hosted site (Cloudflare Pages) is the same build with no proxy: the browser calls the user's ABS server directly, which is why ABS must allow its origin. `public/_headers` and `public/_redirects` are for Pages only; nginx does not serve them.

## Icons

Book spines on a shelf, their heights a sound wave. The tallest spine ("the book") is the one element with a colour of its own, and users choose it.

- `icons/app-icon.svg` is the full icon (full bleed; iOS and Android round the corners) and `icons/favicon.svg` a simpler three-spine version for browser tabs, legible at 16px. In both, the book is class `book`.
- `icons/book-colours.json` lists the colours users can pick from. The first is the default.
- `icons/render.cjs` pre-renders every colour into `public/book/<id>/` (`apple-touch-icon.png` at 180, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` with the art at 80% inside Android's safe zone, and a `manifest.webmanifest`), and the default into the root of `public/` (the same PNGs, plus `icon.svg`). `public/manifest.webmanifest` is the template for the per-colour manifests. Rerun it after changing a template or the list:

```
pnpm --filter @joepittsy/ui exec node ../../apps/web/icons/render.cjs
```

In the app, Settings' App card opens a picker before installing (`src/frame/bookColour.ts`). The choice is stored on the device and applied at every boot: the tab icon is drawn from the favicon template, and the `apple-touch-icon` and manifest links point at that colour's set, which is what iOS copies at Add to Home Screen and Chromium installs from. An app already installed keeps the icon it was installed with.
