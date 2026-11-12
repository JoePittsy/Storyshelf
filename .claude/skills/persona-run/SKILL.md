---
name: persona-run
description: Run the persona test agents against the local Audiobookshelf and report verified findings and a scorecard. Use when asked to run the personas, do a persona round, or test a release candidate as users would.
---

# Persona run

Simulated users drive the real app in a browser, each with their own Audiobookshelf account and their own persistent
browser profile. Each one runs a fixed task list (a scorecard that can be compared between runs), then explores in
character. Nothing a persona says is reported until a second agent has reproduced it.

The kit lives in `e2e/personas/` (its `README.md` explains the files). This skill is the order of work.

## Why it is shaped this way

The first round found two real bugs that 1,361 unit tests missed, and about a third of its "major" findings were wrong:
fresh browsers made device-kept state look lost, agents claimed things were missing without trying them, and script
mistakes were reported as product bugs. Three wrong findings reached the owner. So: persistent profiles, fixed tasks,
a repro script with every finding, and a verifier before the report.

## Arguments

`/persona-run [personas…] [--url <app url>] [--focus "<what changed>"]`

- No personas named: all of them (`e2e/personas/personas/*.md`).
- `--url`: default `http://localhost:18080`, the production build (service worker, offline). The dev server on 5173
  works but offline tasks skip there.
- `--focus`: what to look at hardest, in the owner's words or taken from the diff or release notes under test.

## Steps

1. **Environment.** From the repo root: `./e2e/up.sh --app` (add `--both` when archive.org can be reached). It is safe
   to re-run and never needs the server taken down. Check the app URL answers and `e2e/.env` has a password for each
   persona. If Docker or the server can't start, stop and say so; don't fall back silently to another URL.
2. **One agent per persona, in parallel.** Read each persona file's front matter for `model` and `device`. Spawn a
   fresh general-purpose agent on that model with `e2e/personas/AGENT-BRIEF.md` as its prompt, filled in for the
   persona, plus the app URL, an output folder (`e2e/personas/runs/<date>-<n>/<persona>/`) and the focus if one was
   given. The models are part of the design: Haiku for the naive and impatient users, Sonnet for the ones who measure.
   Don't upgrade them without being asked.
3. **Collect.** Each agent returns an in-character paragraph, its scorecard and its findings by id. Read
   `scorecard.json` and `findings.json` from the output folders yourself; don't rely on the summaries.
4. **Verify.** Spawn one Sonnet agent per persona that has findings, with `e2e/personas/VERIFIER-BRIEF.md`. It runs
   each repro twice and reads the source for anything confirmed, and returns `bug`, `by-design` or `test-artefact`
   for each. A finding with no repro script, or one that does not reproduce, is dropped from the report and counted.
5. **Scorecard.** Put every persona's task results in one table. If an earlier run's folder exists, show what changed
   since then: tasks that went from pass to fail first.
6. **Report to the owner**, in this order: tasks that regressed; verified bugs by severity, each with who hit it, the
   repro path and a screenshot; things that are by design but tripped someone up (a note, not a bug); how many findings
   were dropped and why; what this run could not cover. Keep the personas' own words to a line each.
7. **Offer, don't do:** a regression test in `apps/web/e2e/` for each verified bug, and fixes. Wait for the owner.

## Rules

- Personas never read the app's source and never change the repo. The verifier reads source and changes nothing.
- Each persona uses only its own account. The local server is shared: nobody restarts it or runs
  `docker compose down`.
- A finding that rests on stored state (speed, downloads, the restored player) must come from the persistent
  profile. A fresh profile is a new device and must be labelled as one.
- Limits to state every time: silent or public-domain audio that no agent can hear, Chromium only (no Safari, lock
  screen, AirPods or AirPlay), and taste judged from screenshots.
