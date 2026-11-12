#!/usr/bin/env node
// The verifier's first step: runs every finding's repro script twice, each in a fresh process, and says what happened.
//
//   node e2e/personas/verify-finding.mjs <findings.json> [--id F-01 --id F-02 | --id F-01,F-02] [--out verified.json] [--timeout 240]
//
// A repro exits 0 when the problem is observed and 1 when it is not (see the findings section of AGENT-BRIEF.md). So:
//   confirmed        both runs exited 0
//   flaky            exactly one run exited 0
//   not-reproduced   both runs exited 1
//   script-error     a run crashed, timed out or exited with anything but 0 or 1 (the repro itself is broken: fix it, it is not evidence)
// Runs are one after the other, never together: they share the persona's browser profile, and a profile can only be open once.
// Writes verified.json beside the findings (or --out). Exit status: 1 when a repro is a script error or a file is missing,
// otherwise 0: a finding that doesn't reproduce is a result, not a failure of this script.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { ROOT } from './lib/pw.mjs';

const args = process.argv.slice(2);
const opts = { ids: [], out: undefined, timeout: 240 };
let file;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--id') opts.ids.push(...String(args[++i]).split(','));
  else if (a === '--out') opts.out = args[++i];
  else if (a === '--timeout') opts.timeout = Number(args[++i]);
  else if (a.startsWith('--')) fail(`Unknown option ${a}`);
  else file = a;
}
if (!file) fail('Usage: verify-finding.mjs <findings.json> [--id <id>] [--out <file>] [--timeout <seconds>]');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const findingsFile = resolve(file);
if (!existsSync(findingsFile)) fail(`No such file: ${findingsFile}`);
const parsed = JSON.parse(readFileSync(findingsFile, 'utf8'));
const findings = (Array.isArray(parsed) ? parsed : parsed.findings) ?? [];
const chosen = opts.ids.length ? findings.filter((f) => opts.ids.includes(f.id)) : findings;
if (!chosen.length) fail(opts.ids.length ? `No finding with id ${opts.ids.join(', ')} in ${findingsFile}` : `${findingsFile} has no findings`);

/** A repro path is read relative to the findings file first, then to the repo root. */
function reproPath(f) {
  if (!f.repro) return null;
  const candidates = isAbsolute(f.repro) ? [f.repro] : [resolve(dirname(findingsFile), f.repro), resolve(ROOT, f.repro)];
  return candidates.find((c) => existsSync(c)) ?? null;
}

const tail = (text) => text.trim().split(/\r?\n/).slice(-15).join('\n').slice(-2000);

function run(script) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: opts.timeout * 1000, env: process.env, cwd: dirname(script) });
  const exit = r.status; // null when killed (timeout) or when it couldn't start
  return { exit, signal: r.signal, seconds: Math.round((Date.now() - started) / 100) / 10, tail: tail(`${r.stdout ?? ''}\n${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`) };
}

const results = [];
for (const f of chosen) {
  const script = reproPath(f);
  if (!script) {
    results.push({ id: f.id, severity: f.severity, title: f.title, status: 'script-error', runs: [], note: `repro "${f.repro}" not found` });
    continue;
  }
  process.stdout.write(`${f.id} (${f.severity}) ... `);
  const runs = [run(script), run(script)];
  const observed = runs.filter((r) => r.exit === 0).length;
  const broken = runs.some((r) => r.exit !== 0 && r.exit !== 1);
  const status = broken ? 'script-error' : observed === 2 ? 'confirmed' : observed === 1 ? 'flaky' : 'not-reproduced';
  console.log(status);
  results.push({ id: f.id, severity: f.severity, title: f.title, persona: f.persona, confidence: f.confidence, status, runs: runs.map(({ exit, signal, seconds, tail }) => ({ exit, signal, seconds, tail })) });
}

const out = resolve(opts.out ?? resolve(dirname(findingsFile), 'verified.json'));
writeFileSync(out, JSON.stringify({ verifiedAt: new Date().toISOString(), findingsFile, results }, null, 2));
console.log(`\n| id | severity | status | run 1 | run 2 |\n| --- | --- | --- | --- | --- |`);
for (const r of results) console.log(`| ${r.id} | ${r.severity ?? ''} | ${r.status} | ${r.runs[0]?.exit ?? '-'} | ${r.runs[1]?.exit ?? '-'} |`);
console.log(`\nWritten to ${out}`);
process.exit(results.some((r) => r.status === 'script-error') ? 1 : 0);
