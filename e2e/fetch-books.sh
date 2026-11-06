#!/usr/bin/env bash
# Downloads a small set of public-domain LibriVox audiobooks from archive.org
# into data/audiobooks, in Audiobookshelf's Author/[Series/]Title folder layout.
# Idempotent: files that already exist are skipped.
set -euo pipefail
cd "$(dirname "$0")"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

ROOT=data/audiobooks

# identifier | destination folder | audio to take (mp3 = 64 kbps chapter MP3s, m4b = single M4B)
# Each book covers a case Storyshelf needs to handle; see README.md.
# LibriVox files carry no narrator tag, so "Title {Reader}" in the folder name gives ABS
# the narrator. Peter Rabbit has many readers and is left without one on purpose.
BOOKS=(
  "thetaleofpeterrabbitandothers_2008_librivox|Beatrix Potter/The Tale of Peter Rabbit and Others|mp3"
  "grande_breteche_1610_librivox|Honoré de Balzac/La Grande Bretèche {Nicholas Clifford}|m4b"
  "theadventureofthebluecarbuncle_2208_librivox|Arthur Conan Doyle/Sherlock Holmes/1 - The Adventure of the Blue Carbuncle {Phil Chenevert}|mp3"
  "adventureofthecopperbeeches_2108_librivox|Arthur Conan Doyle/Sherlock Holmes/2 - The Adventure of the Copper Beeches {Phil Chenevert}|mp3"
  "velveteen_rabbit_librivox|Margery Williams/The Velveteen Rabbit {Marlo Dianne}|mp3"
)

# jq on Windows writes CRLF line endings; strip the CRs.
jqr() { jq -r "$@" | tr -d '\r'; }

download() { # url dest
  if [[ -s "$2" ]]; then echo "  skip  $2"; return; fi
  echo "  get   $2"
  curl -fsSL --retry 3 -o "$2.part" "$1"
  mv "$2.part" "$2"
}

for entry in "${BOOKS[@]}"; do
  IFS='|' read -r id dest kind <<<"$entry"
  echo "$dest"
  mkdir -p "$ROOT/$dest"
  meta=$(curl -fsSL --retry 3 "https://archive.org/metadata/$id")

  if [[ $kind == m4b ]]; then
    files=$(jqr '.files[] | select(.name | endswith(".m4b")) | .name' <<<"$meta")
  else
    files=$(jqr '.files[] | select(.format == "64Kbps MP3") | .name' <<<"$meta")
  fi
  [[ -n $files ]] || { echo "  no $kind files found for $id" >&2; exit 1; }

  while IFS= read -r f; do
    download "https://archive.org/download/$id/$f" "$ROOT/$dest/$f"
  done <<<"$files"

  # The item's cover art is its plain JPEG (not the thumb or tile).
  cover=$(jqr '[.files[] | select(.format == "JPEG") | .name][0] // empty' <<<"$meta")
  if [[ -n $cover ]]; then
    download "https://archive.org/download/$id/$cover" "$ROOT/$dest/cover.jpg"
  fi
done

echo "Done: $(du -sh "$ROOT" | cut -f1) in $ROOT"
