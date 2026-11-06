# Build from the repo root: docker build -f apps/web/Dockerfile -t storyshelf .
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @joepittsy/ui build && pnpm --filter @storyshelf/web build

FROM nginx:alpine
ENV ABS_UPSTREAM=http://audiobookshelf:80
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
