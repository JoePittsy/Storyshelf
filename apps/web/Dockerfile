# Build from the repo root: docker build -f apps/web/Dockerfile -t storyshelf .
# The build stage runs on the builder's own platform: its output is static files, so a
# multi-arch build (linux/amd64 + linux/arm64) only needs the nginx stage per platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# The web build compiles @joepittsy/ui from source (the @joepittsy/source condition), so the ui package needs no build of its own.
RUN pnpm --filter @storyshelf/web build

FROM nginx:alpine
LABEL org.opencontainers.image.title="Storyshelf" \
      org.opencontainers.image.description="A listening-first web app for Audiobookshelf" \
      org.opencontainers.image.source="https://github.com/JoePittsy/Storyshelf" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV ABS_UPSTREAM=http://audiobookshelf:80
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
