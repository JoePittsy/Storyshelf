// Release rules for pull requests into main, shared by the release-check and tag-release workflows.
// apps/web/package.json's version is the switch: leave it alone and merging releases nothing; bump it one step
// (major, minor or patch) and merging releases that version, with the PR's "## Release notes" as the text.
//
//   node .github/scripts/release.mjs check <base-version> <head-version> <body-file>
//     Prints what merging will do; exits 1 with the reason if the bump or the notes aren't right.
//
//   node .github/scripts/release.mjs notes <body-file>
//     Prints the "## Release notes" section of a PR body (empty if there is none).
import { readFileSync } from 'node:fs';

// A pre-release (1.2.0-alpha, 1.2.0-beta.2) releases too, as a GitHub pre-release and a Docker tag, but not as
// `latest` and not to the hosted site (release.yml). It may follow the last version one step on (1.1.4 → 1.2.0-alpha),
// move to a later pre-release of the same version (1.2.0-alpha → 1.2.0-alpha.2), or graduate (1.2.0-alpha → 1.2.0).

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/.exec(v);
  if (!m) throw new Error(`"${v}" is not MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease`);
  return { core: m.slice(1, 4).map(Number), pre: m[4] ?? null };
};
const coreOf = (v) => parse(v).core.join('.');

/** "1.2.3" (or "1.2.3-alpha") bumped by kind, on the MAJOR.MINOR.PATCH part. */
export function bump(version, kind) {
  const [maj, min, pat] = parse(version).core;
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`unknown bump "${kind}"`);
}

/** Semver precedence of two pre-release strings: negative when a comes first. */
function comparePre(a, b) {
  const x = a.split('.');
  const y = b.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const nx = /^\d+$/.test(x[i]);
    const ny = /^\d+$/.test(y[i]);
    if (nx && ny && Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
    if (nx !== ny) return nx ? -1 : 1;
    if (!nx && x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Which step takes base to head: 'none' if unchanged; 'major' | 'minor' | 'patch' for a release one step on;
 * 'premajor' | 'preminor' | 'prepatch' for a pre-release of one; 'prerelease' for a later pre-release of the same
 * version; 'graduate' for the release a pre-release led to. Null if it isn't one of those.
 */
export function bumpKind(base, head) {
  if (base === head) return 'none';
  const b = parse(base);
  const h = parse(head);
  const sameCore = coreOf(base) === coreOf(head);
  if (b.pre && sameCore) {
    if (!h.pre) return 'graduate';
    return comparePre(h.pre, b.pre) > 0 ? 'prerelease' : null;
  }
  const kind = ['major', 'minor', 'patch'].find((k) => bump(base, k) === coreOf(head)) ?? null;
  return kind && h.pre ? `pre${kind}` : kind;
}

/** The text under "## Release notes", up to the next heading of the same or higher level. HTML comments dropped. */
export function releaseNotes(body) {
  const lines = (body ?? '').replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const start = lines.findIndex((l) => /^##\s+release notes\s*$/i.test(l));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,2}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** The verdict for a PR: { ok, message }. */
export function checkPr({ baseVersion, headVersion, body }) {
  let kind;
  try {
    kind = bumpKind(baseVersion, headVersion);
  } catch (e) {
    return { ok: false, message: `apps/web/package.json: ${e.message}.` };
  }
  if (kind === 'none') return { ok: true, message: `No release: apps/web stays at ${baseVersion}.` };
  if (!kind) {
    const steps = ['patch', 'minor', 'major'].map((k) => bump(baseVersion, k)).join(', ');
    const pre = parse(baseVersion).pre ? ` ${coreOf(baseVersion)} or a later ${coreOf(baseVersion)}-…,` : '';
    return { ok: false, message: `${baseVersion} → ${headVersion} isn't a single step. From ${baseVersion} use${pre} ${steps} (each optionally with a -prerelease such as -alpha), or leave it at ${baseVersion} to not release.` };
  }
  if (!releaseNotes(body)) {
    return { ok: false, message: `This bumps ${baseVersion} → ${headVersion}, so add a "## Release notes" section to the PR description. It becomes the GitHub Release text.` };
  }
  const pre = parse(headVersion).pre
    ? ' A pre-release: a GitHub pre-release and Docker tag, not `latest` and not the hosted site.'
    : '';
  return { ok: true, message: `Merging releases v${headVersion} (${kind}).${pre}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'check') {
    const [baseVersion, headVersion, bodyFile] = args;
    const r = checkPr({ baseVersion, headVersion, body: readFileSync(bodyFile, 'utf8') });
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'notes') {
    process.stdout.write(releaseNotes(readFileSync(args[0], 'utf8')));
  } else {
    console.error('usage: release.mjs check <base> <head> <body-file> | notes <body-file>');
    process.exit(2);
  }
}
