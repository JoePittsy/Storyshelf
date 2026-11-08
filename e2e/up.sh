#!/usr/bin/env bash
# One command from nothing to a local ABS with books and listening history:
#   1. starts the Docker daemon if it isn't running and we can (root, dockerd installed)
#   2. pulls ABS; if ghcr.io's blob host is blocked, pulls the same tag from Docker Hub
#   3. downloads the LibriVox books; if archive.org is blocked, makes stand-in books instead
#   4. starts ABS, runs init.sh, then seed-progress.sh
# Safe to re-run. Flags: --stand-in (skip archive.org), --no-seed (no listening history).
set -euo pipefail
cd "$(dirname "$0")"

STAND_IN=0 SEED=1
for a in "$@"; do
  case $a in
    --stand-in) STAND_IN=1 ;;
    --no-seed) SEED=0 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

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
if [[ -n $(find data/audiobooks -name '*.m4b' -o -name '*.mp3' | head -1) ]]; then
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
[[ $SEED == 0 ]] || ./seed-progress.sh

echo
echo "ABS is on http://localhost:13378 (passwords in e2e/.env)."
echo "For the app: ABS_URL=http://localhost:13378 in apps/web/.env.local, then pnpm --filter @storyshelf/web dev"
