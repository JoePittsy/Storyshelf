#!/usr/bin/env bash
# Puts each persona user (created by init.sh) in the starting state its role needs, over the ABS HTTP API.
# Books are chosen by their properties (length, chapters), never by title, so the library can be the LibriVox
# books, the stand-ins or both. Unlike seed-progress.sh, a re-run resets every persona to exactly this state:
# its listening progress and bookmarks are deleted first, then written again.
#
#   margaret, sam, leo  no listening history at all
#   dan                 two books finished, two part-way (the most recent has chapters)
#   priya               every book finished but two, which are part-way
#   ruth                two books part-way
#   joe                 one book part-way, with chapters
#
#   ./seed-personas.sh              # all seven
#   ./seed-personas.sh --only dan   # just one
set -euo pipefail
cd "$(dirname "$0")"

jqr() { jq -r "$@" | tr -d '\r'; }
[[ -f .env ]] || { echo "No .env: run ./init.sh first" >&2; exit 1; }
set -a && . ./.env && set +a
ABS_E2E_URL=${ABS_E2E_URL:-http://localhost:13378}

PERSONAS=(margaret dan priya sam leo ruth joe)
ONLY=""
while (( $# )); do
  case $1 in
    --only)
      [[ -n ${2:-} ]] || { echo "--only needs a persona name: ${PERSONAS[*]}" >&2; exit 2; }
      ONLY=${2,,}; shift 2 ;;
    *) echo "Unknown option: $1 (usage: seed-personas.sh [--only <name>])" >&2; exit 2 ;;
  esac
done
if [[ -n $ONLY ]]; then
  [[ " ${PERSONAS[*]} " == *" $ONLY "* ]] || { echo "Unknown persona '$ONLY'; choose from: ${PERSONAS[*]}" >&2; exit 2; }
  PERSONAS=("$ONLY")
fi

login() { # user password -> token
  local body
  body=$(jq -n --arg u "$1" --arg p "$2" '{username: $u, password: $p}')
  curl -fsS -X POST "$ABS_E2E_URL/login" -H 'Content-Type: application/json' --data "$body" | jqr .user.accessToken
}
api() { # method path [json-body]; uses $TOKEN
  curl -fsS -X "$1" "$ABS_E2E_URL$2" -H "Authorization: Bearer $TOKEN" ${3:+-H 'Content-Type: application/json' --data "$3"}
}

# The books (root lists them), in title order: "id duration chapters title". CH holds the ones worth resuming (chapters, over 30 minutes).
TOKEN=$(login "$ABS_E2E_USER" "$ABS_E2E_PASSWORD")
LIB_ID=$(api GET /api/libraries | jqr '.libraries[] | select(.name == "E2E Audiobooks") | .id')
[[ -n $LIB_ID ]] || { echo "No 'E2E Audiobooks' library: run ./init.sh first" >&2; exit 1; }
mapfile -t ALL < <(api GET "/api/libraries/$LIB_ID/items?sort=media.metadata.title&minified=1" |
  jqr '.results[] | "\(.id) \(.media.duration) \(.media.numChapters // 0) \(.media.metadata.title)"')
(( ${#ALL[@]} >= 4 )) || { echo "Need at least 4 books to seed the personas; found ${#ALL[@]}" >&2; exit 1; }
CH=()
for b in "${ALL[@]}"; do
  read -r _ d n _ <<<"$b"
  if (( n >= 2 )) && awk "BEGIN{exit !($d >= 1800)}"; then CH+=("$b"); fi
done
(( ${#CH[@]} >= 1 )) || { echo "No book with chapters and over 30 minutes to resume; need one" >&2; exit 1; }

# The books each persona gets, as "fraction book" lines in the order they are written (the last is the most recent).
# A fraction of 1 is finished. B is a book with chapters; A is the last of the others.
BOOK_B=${CH[-1]}
others=() # every book but B
for b in "${ALL[@]}"; do [[ $b == "$BOOK_B" ]] || others+=("$b"); done
BOOK_A=${others[-1]}
rest=() # every book but A and B, in title order
for b in "${others[@]}"; do [[ $b == "$BOOK_A" ]] || rest+=("$b"); done

plan() { # persona -> lines of "fraction id duration chapters title"
  local b
  case $1 in
    margaret | sam | leo) ;;
    dan) # two finished, then two part-way
      printf '1 %s\n1 %s\n0.25 %s\n0.4 %s\n' "${rest[0]}" "${rest[1]}" "$BOOK_A" "$BOOK_B" ;;
    priya) # all the rest finished, then two part-way
      for b in "${rest[@]}"; do printf '1 %s\n' "$b"; done
      printf '0.6 %s\n0.15 %s\n' "$BOOK_A" "$BOOK_B" ;;
    ruth) printf '0.35 %s\n0.1 %s\n' "$BOOK_A" "$BOOK_B" ;;
    joe) printf '0.2 %s\n' "$BOOK_B" ;;
  esac
}

for p in "${PERSONAS[@]}"; do
  key="ABS_E2E_PERSONA_${p^^}_PASSWORD"
  [[ -n ${!key:-} ]] || { echo "No $key in .env: run ./init.sh first" >&2; exit 1; }
  TOKEN=$(login "$p" "${!key}")

  # Clear what is there: listening records, then bookmarks.
  me=$(api GET /api/me)
  for id in $(jqr '.mediaProgress[]?.id' <<<"$me"); do api DELETE "/api/me/progress/$id" >/dev/null; done
  while read -r item time; do
    [[ -n $item ]] && api DELETE "/api/me/item/$item/bookmark/$time" >/dev/null
  done < <(jqr '.bookmarks[]? | "\(.libraryItemId) \(.time)"' <<<"$me")

  echo "$p"
  while read -r f id duration _ title; do
    [[ -n $f ]] || continue
    body=$(jq -n --argjson d "$duration" --argjson f "$f" \
      '{duration: $d, currentTime: ($d * $f), progress: $f, isFinished: ($f >= 1)}')
    api PATCH "/api/me/progress/$id" "$body" >/dev/null
    state=$(awk "BEGIN{print ($f >= 1) ? \"finished\" : int($f*100) \"%\"}")
    echo "  $title: $state"
    sleep 0.2 # distinct lastUpdate times, so the order is the order above
  done < <(plan "$p")
  [[ -n $(plan "$p") ]] || echo "  no listening history"
done
