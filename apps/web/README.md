# Storyshelf web

React PWA front end for a self-hosted [Audiobookshelf](https://www.audiobookshelf.org) (ABS) server. ABS stays the backend; Storyshelf needs ABS 2.26.0 or later with local sign-in enabled.

The browser only ever talks to Storyshelf's own origin. The dev server (Vite) and the production container (nginx) both forward `/api`, `/login`, `/logout`, `/auth`, `/status` and `/public` to ABS, so ABS's httpOnly refresh cookie belongs to Storyshelf's origin and no CORS is involved.

## Development

Create `apps/web/.env.local` (gitignored):

```
ABS_URL=https://your-abs-host
```

Then `pnpm --filter @storyshelf/web dev` and open http://localhost:5173.

Scripts: `typecheck`, `lint`, `test`, `build`.

## Production

Build from the repository root (the image needs the whole workspace):

```
docker build -f apps/web/Dockerfile -t storyshelf .
```

`ABS_UPSTREAM` is the ABS address as seen from the Storyshelf container.

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
    image: storyshelf
    environment:
      ABS_UPSTREAM: http://audiobookshelf:80
    ports:
      - "8080:80"
    depends_on:
      - audiobookshelf
    restart: unless-stopped
```

Serve Storyshelf over HTTPS (for example behind your existing reverse proxy): ABS marks its refresh cookie `Secure`, so sign-in will not persist over plain HTTP except on `localhost`.

## Icons

The icons in `public/` are placeholders.
