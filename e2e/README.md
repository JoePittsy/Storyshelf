# Local Audiobookshelf for e2e tests

A throwaway Audiobookshelf (ABS) server in Docker, pinned to 2.37.2 to match the real
server, with a handful of public-domain LibriVox audiobooks from archive.org.

## Set up

From this folder (Git Bash on Windows is fine). Needs Docker, `curl`, `jq` and `openssl`.

```sh
./fetch-books.sh        # ~170 MB into data/audiobooks; re-runs skip existing files
docker compose up -d    # ABS on http://localhost:13378
./init.sh               # root user, library, scan, second user; writes .env
```

`init.sh` talks only to the ABS HTTP API. It generates both passwords and writes them to
`.env` (gitignored; `.env.example` lists the keys). It is safe to re-run: steps already
done are skipped, and it rescans the library and prints a summary each time.

To start again from nothing:

```sh
docker compose down
rm -rf data/config data/metadata .env   # keep data/audiobooks to avoid re-downloading
docker compose up -d && ./init.sh
```

## What's in the library

| Folder | Covers |
| --- | --- |
| `Beatrix Potter/The Tale of Peter Rabbit and Others` | 18 MP3s, 2–28 min each: file-to-file transitions, chapter navigation; no narrator |
| `Honoré de Balzac/La Grande Bretèche {Nicholas Clifford}` | single M4B with 2 embedded chapters; accented author and title |
| `Arthur Conan Doyle/Sherlock Holmes/1 - The Adventure of the Blue Carbuncle {Phil Chenevert}` | series, sequence 1 |
| `Arthur Conan Doyle/Sherlock Holmes/2 - The Adventure of the Copper Beeches {Phil Chenevert}` | series, sequence 2 |
| `Margery Williams/The Velveteen Rabbit {Marlo Dianne}` | single untagged MP3 with no chapters; different narrator |

ABS reads author, series, sequence and title from the folder path, and the narrator from
`{…}` at the end of the title folder (LibriVox files have no narrator tag). The book list
and archive.org identifiers live in `fetch-books.sh`.

## Users

| `.env` keys | Account |
| --- | --- |
| `ABS_E2E_USER` / `ABS_E2E_PASSWORD` | `root` (admin) |
| `ABS_E2E_USER2` / `ABS_E2E_PASSWORD2` | `e2e-user`, ordinary user, for multi-user and progress-isolation tests |
