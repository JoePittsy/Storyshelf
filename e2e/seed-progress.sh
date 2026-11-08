#!/usr/bin/env bash
# Gives the root user some listening history, so the Library's hero, Continue listening,
# series progress and the mini player have something to show.
#   - the first book by title is finished
#   - the next four are part-way through, the last of them the most recent (the hero)
# Skipped if root already has progress. Run after init.sh.
set -euo pipefail
cd "$(dirname "$0")"

jqr() { jq -r "$@" | tr -d '\r'; }
[[ -f .env ]] || { echo "No .env: run ./init.sh first" >&2; exit 1; }
set -a && . ./.env && set +a
ABS_E2E_URL=${ABS_E2E_URL:-http://localhost:13378}

body=$(jq -n --arg u "$ABS_E2E_USER" --arg p "$ABS_E2E_PASSWORD" '{username: $u, password: $p}')
TOKEN=$(curl -fsS -X POST "$ABS_E2E_URL/login" -H 'Content-Type: application/json' --data "$body" | jqr .user.accessToken)
api() { curl -fsS -X "$1" "$ABS_E2E_URL$2" -H "Authorization: Bearer $TOKEN" ${3:+-H 'Content-Type: application/json' --data "$3"}; }

if [[ $(api GET /api/me | jqr '.mediaProgress | length') != 0 ]]; then
  echo "Root already has listening progress; leaving it"
  exit 0
fi

LIB_ID=$(api GET /api/libraries | jqr '.libraries[] | select(.name == "E2E Audiobooks") | .id')
mapfile -t items < <(api GET "/api/libraries/$LIB_ID/items?sort=media.metadata.title" |
  jqr '.results[] | "\(.id) \(.media.duration) \(.media.metadata.title)"')
(( ${#items[@]} >= 5 )) || { echo "Need at least 5 books to seed progress; found ${#items[@]}" >&2; exit 1; }

# fraction listened for items[0..4]; 1 = finished
fractions=(1 0.25 0.7 0.24 0.53)
for i in 0 1 2 3 4; do
  read -r id duration title <<<"${items[$i]}"
  f=${fractions[$i]}
  body=$(jq -n --argjson d "$duration" --argjson f "$f" \
    '{duration: $d, currentTime: ($d * $f), progress: $f, isFinished: ($f >= 1)}')
  api PATCH "/api/me/progress/$id" "$body" >/dev/null
  echo "  $title: $(awk "BEGIN{print int($f*100)}")%"
  sleep 1.1 # distinct lastUpdate times, so the order is the order above
done
