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

The hosted site (Cloudflare Pages) is the same build with no proxy: the browser calls the user's ABS server directly, which is why ABS must allow its origin. `public/_headers` and `public/_redirects` are for Pages only; nginx does not serve them.

## Icons

Book spines on a shelf, their heights a sound wave. The templates are in `icons/`: `app-icon.svg` (the full icon, full bleed; iOS and Android round the corners) and `favicon.svg` (a simpler three-spine version for browser tabs, which stays legible at 16px). `render.cjs` builds everything in `public/` from them: `icon.svg`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (the art at 80%, inside Android's safe zone).

```
pnpm --filter @joepittsy/ui exec node ../../apps/web/icons/render.cjs                  # default off-white book
pnpm --filter @joepittsy/ui exec node ../../apps/web/icons/render.cjs --book=#f2a65a   # colour the tallest spine
```

The tallest spine ("the book") is the one element with a colour of its own: class `book` in both templates. Home-screen icons are copied when the app is installed, so a new colour reaches an installed app only when it's added again; the browser tab picks it up on the next load.
