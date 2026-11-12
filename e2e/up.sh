#!/usr/bin/env bash
# One command from nothing to a local ABS with books and listening history:
#   1. starts the Docker daemon if it isn't running and we can (root, dockerd installed)
#   2. pulls ABS; if ghcr.io's blob host is blocked, pulls the same tag from Docker Hub
#   3. downloads the LibriVox books; if archive.org is blocked, makes stand-in books instead
#   4. starts ABS, runs init.sh, then seed-progress.sh and seed-personas.sh
#   5. with --app, builds the web app and serves it with the real nginx config on http://localhost:18080
# Safe to re-run. Flags:
#   --stand-in  skip archive.org and make the stand-in books
#   --both      the LibriVox books and the stand-in books (stand-ins only if archive.org can't be reached)
#   --no-seed   no listening history for root or the personas
#   --app       also build apps/web and serve it, with a service worker, next to ABS
set -euo pipefail
cd "$(dirname "$0")"

STAND_IN=0 BOTH=0 SEED=1 APP=0
for a in "$@"; do
  case $a in
    --stand-in) STAND_IN=1 ;;
    --both) BOTH=1 ;;
    --app) APP=1 ;;
    --no-seed) SEED=0 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

[[ $STAND_IN == 0 || $BOTH == 0 ]] || { echo "--stand-in and --both can't be used together" >&2; exit 2; }

# 1. Docker daemon
if ! docker info >/dev/null 2>&1; then
  if [[ $EUID == 0 ]] && command -v dockerd >/dev/null; then
    echo "Starting the Docker daemon"
    nohup dockerd >/tmp/dockerd.log 2>&1 &
    for _ in $(seq 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  docker info >/dev/null 2>&1 || { echo "Docker isn't running; start it and re-run" >&2; exit 1; }
fi

# 2. ABS image
IMAGE=$(sed -n 's/^ *image: *//p' docker-compose.yml | head -1)
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  if ! docker pull -q "$IMAGE"; then
    HUB="docker.io/advplyr/audiobookshelf:${IMAGE##*:}"
    echo "Couldn't pull $IMAGE; trying $HUB (the same image on Docker Hub)"
    docker pull -q "$HUB"
    docker tag "$HUB" "$IMAGE"
  fi
fi

# 3. Books
mkdir -p data/audiobooks
if [[ $BOTH == 1 ]]; then
  # Both sets: they are what the persona and e2e runs need together (multi-file books with no chapters and accented
  # metadata from LibriVox; long chaptered books with narrators from the stand-ins). Both scripts skip what exists.
  if curl -fsS -o /dev/null --max-time 10 https://archive.org/metadata/velveteen_rabbit_librivox; then
    ./fetch-books.sh
  else
    echo "archive.org can't be reached; --both makes the stand-in books only (LibriVox books already in data/audiobooks stay)"
  fi
  python3 stand-in-books.py
elif [[ -n $(find data/audiobooks -name '*.m4b' -o -name '*.mp3' | head -1) ]]; then
  echo "Books already in data/audiobooks"
elif [[ $STAND_IN == 0 ]] && curl -fsS -o /dev/null --max-time 10 https://archive.org/metadata/velveteen_rabbit_librivox; then
  ./fetch-books.sh
else
  [[ $STAND_IN == 1 ]] || echo "archive.org can't be reached; making stand-in books instead"
  python3 stand-in-books.py
fi

# 4. ABS, users, library, history
docker compose up -d --pull never
./init.sh
if [[ $SEED == 1 ]]; then
  ./seed-progress.sh
  ./seed-personas.sh
fi

# 5. The production build, served by the real nginx config
if [[ $APP == 1 ]]; then
  # apps/web/Dockerfile isn't used: building it needs registry access from inside a Docker build, which many sandboxes
  # block. The compose service mounts the host-built dist into nginx with the repo's own template instead.
  command -v pnpm >/dev/null || { echo "--app needs pnpm (corepack enable)" >&2; exit 1; }
  [[ -d ../node_modules ]] || { echo "--app needs the workspace installed: run pnpm install at the repo root" >&2; exit 1; }
  echo "Building apps/web"
  (cd .. && pnpm --filter @storyshelf/web build)
  [[ -f ../apps/web/dist/index.html ]] || { echo "The build left no apps/web/dist/index.html" >&2; exit 1; }
  if ! docker image inspect nginx:alpine >/dev/null 2>&1; then
    docker pull -q nginx:alpine || { echo "Couldn't pull nginx:alpine from Docker Hub" >&2; exit 1; }
  fi
  docker compose --profile app up -d --pull never
  # A bind mount follows the directory, not its path: if a build ever replaces dist itself, the container keeps the old one.
  if ! docker exec storyshelf-e2e-web test -f /usr/share/nginx/html/index.html; then
    echo "The web container lost sight of dist; restarting it"
    docker compose --profile app restart storyshelf
  fi
  echo -n "Waiting for http://localhost:18080"
  for _ in $(seq 30); do
    [[ $(curl -fsS http://localhost:18080/status 2>/dev/null | jq -r .app 2>/dev/null | tr -d '\r') == audiobookshelf ]] && break
    echo -n .
    sleep 1
  done
  echo
  [[ $(curl -fsS http://localhost:18080/status | jq -r .app | tr -d '\r') == audiobookshelf ]] ||
    { echo "http://localhost:18080/status didn't answer as ABS; see: docker logs storyshelf-e2e-web" >&2; exit 1; }
fi

echo
echo "ABS is on http://localhost:13378 (passwords in e2e/.env)."
[[ $APP == 0 ]] || echo "Storyshelf (production build, real nginx config, service worker) is on http://localhost:18080"
echo "For the app: ABS_URL=http://localhost:13378 in apps/web/.env.local, then pnpm --filter @storyshelf/web dev"
