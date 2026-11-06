#!/usr/bin/env bash
# First-run setup for the local Audiobookshelf server, over its HTTP API only.
#   - creates the root user (password generated and saved to .env)
#   - creates the "E2E Audiobooks" book library on /audiobooks and scans it
#   - creates a second, non-admin user (also saved to .env)
#   - prints a summary of what ABS scanned
# Safe to re-run: each step is skipped if already done. Never prints passwords.
set -euo pipefail
cd "$(dirname "$0")"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
jqr() { jq -r "$@" | tr -d '\r'; } # jq on Windows writes CRLF

ENV_FILE=.env
LIBRARY_NAME="E2E Audiobooks"
LIBRARY_PATH=/audiobooks

[[ -f $ENV_FILE ]] && set -a && . "./$ENV_FILE" && set +a
ABS_E2E_URL=${ABS_E2E_URL:-http://localhost:13378}
ABS_E2E_USER=${ABS_E2E_USER:-root}
ABS_E2E_USER2=${ABS_E2E_USER2:-e2e-user}

genpass() { openssl rand -base64 18 | tr -d '\r\n/+='; }

write_env() {
  umask 077
  cat >"$ENV_FILE" <<ENV
ABS_E2E_URL=$ABS_E2E_URL
ABS_E2E_USER=$ABS_E2E_USER
ABS_E2E_PASSWORD=${ABS_E2E_PASSWORD:-}
ABS_E2E_USER2=$ABS_E2E_USER2
ABS_E2E_PASSWORD2=${ABS_E2E_PASSWORD2:-}
ENV
}

api() { # method path [json-body]
  curl -fsS -X "$1" "$ABS_E2E_URL$2" -H "Authorization: Bearer $TOKEN" \
    ${3:+-H 'Content-Type: application/json' --data "$3"}
}

echo "Waiting for $ABS_E2E_URL ..."
for _ in $(seq 60); do curl -fsS "$ABS_E2E_URL/status" >/dev/null 2>&1 && break; sleep 2; done
status=$(curl -fsS "$ABS_E2E_URL/status")

# 1. Root user
if [[ $(jqr .isInit <<<"$status") == false ]]; then
  ABS_E2E_PASSWORD=$(genpass)
  body=$(jq -n --arg u "$ABS_E2E_USER" --arg p "$ABS_E2E_PASSWORD" '{newRoot: {username: $u, password: $p}}')
  curl -fsS -X POST "$ABS_E2E_URL/init" -H 'Content-Type: application/json' --data "$body" >/dev/null
  write_env
  echo "Created root user '$ABS_E2E_USER' (password in $ENV_FILE)"
elif [[ -z ${ABS_E2E_PASSWORD:-} || $ABS_E2E_PASSWORD == change-me ]]; then
  echo "Server is already initialised but $ENV_FILE has no root password." >&2
  echo "Start again from scratch: docker compose down && rm -rf data/config data/metadata" >&2
  exit 1
else
  echo "Root user already exists"
fi

# 2. Log in
body=$(jq -n --arg u "$ABS_E2E_USER" --arg p "$ABS_E2E_PASSWORD" '{username: $u, password: $p}')
TOKEN=$(curl -fsS -X POST "$ABS_E2E_URL/login" -H 'Content-Type: application/json' --data "$body" | jqr .user.accessToken)

# 3. Library
LIB_ID=$(api GET /api/libraries | jqr --arg n "$LIBRARY_NAME" '.libraries[] | select(.name == $n) | .id')
if [[ -z $LIB_ID ]]; then
  # MSYS_NO_PATHCONV stops Git Bash rewriting /audiobooks into a Windows path for jq.exe.
  body=$(MSYS_NO_PATHCONV=1 jq -n --arg n "$LIBRARY_NAME" --arg p "$LIBRARY_PATH" \
    '{name: $n, folders: [{fullPath: $p}], mediaType: "book", provider: "google"}')
  LIB_ID=$(api POST /api/libraries "$body" | jqr .id)
  echo "Created library '$LIBRARY_NAME' ($LIB_ID)"
else
  echo "Library '$LIBRARY_NAME' exists ($LIB_ID)"
fi

# 4. Scan and wait for the library-scan task to finish
api POST "/api/libraries/$LIB_ID/scan" >/dev/null
echo -n "Scanning"
sleep 2
for _ in $(seq 150); do
  scanning=$(api GET /api/tasks | jqr --arg id "$LIB_ID" \
    '[.tasks[] | select(.action == "library-scan" and .data.libraryId == $id and (.isFinished | not))] | length')
  [[ $scanning == 0 ]] && break
  echo -n .
  sleep 2
done
echo " done"

# 5. Second, non-admin user
if api GET /api/users | jqr --arg u "$ABS_E2E_USER2" '.users[].username' | grep -qx "$ABS_E2E_USER2"; then
  echo "User '$ABS_E2E_USER2' already exists"
  [[ -n ${ABS_E2E_PASSWORD2:-} && $ABS_E2E_PASSWORD2 != change-me ]] ||
    echo "Warning: $ENV_FILE has no password for '$ABS_E2E_USER2'" >&2
else
  ABS_E2E_PASSWORD2=$(genpass)
  body=$(jq -n --arg u "$ABS_E2E_USER2" --arg p "$ABS_E2E_PASSWORD2" '{username: $u, password: $p, type: "user", isActive: true}')
  api POST /api/users "$body" >/dev/null
  write_env
  echo "Created user '$ABS_E2E_USER2' (password in $ENV_FILE)"
fi

# 6. Summary
echo
echo "Library id: $LIB_ID"
echo "path | author | series | narrators | audio files | tracks | chapters | duration | cover"
for item in $(api GET "/api/libraries/$LIB_ID/items?sort=media.metadata.title" | jqr '.results[].id'); do
  api GET "/api/items/$item?expanded=1" | jqr '
    def hms: "\(. / 3600 | floor)h\(. % 3600 / 60 | floor | tostring | if length < 2 then "0" + . else . end)m";
    [ .relPath,
      .media.metadata.authorName,
      (.media.metadata.series | map("\(.name) #\(.sequence // "-")") | join(", ") | if . == "" then "-" else . end),
      (.media.metadata.narratorName | if . == "" then "-" else . end),
      (.media.numAudioFiles | tostring),
      (.media.numTracks | tostring),
      (.media.numChapters | tostring),
      (.media.duration | hms),
      (if .media.coverPath then "yes" else "no" end)
    ] | join(" | ")'
done
