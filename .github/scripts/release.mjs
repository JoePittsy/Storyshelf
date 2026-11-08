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

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`"${v}" is not MAJOR.MINOR.PATCH`);
  return m.slice(1).map(Number);
};

/** "1.2.3" bumped by kind. Pre-release suffixes are not part of this flow. */
export function bump(version, kind) {
  const [maj, min, pat] = parse(version);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`unknown bump "${kind}"`);
}

/** Which one-step bump takes base to head: 'none' if unchanged, null if it isn't one step. */
export function bumpKind(base, head) {
  if (base === head) return 'none';
  parse(head);
  return ['major', 'minor', 'patch'].find((k) => bump(base, k) === head) ?? null;
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
    return { ok: false, message: `${baseVersion} → ${headVersion} isn't a single bump. From ${baseVersion} use ${steps}, or leave it at ${baseVersion} to not release.` };
  }
  if (!releaseNotes(body)) {
    return { ok: false, message: `This bumps ${baseVersion} → ${headVersion}, so add a "## Release notes" section to the PR description. It becomes the GitHub Release text.` };
  }
  return { ok: true, message: `Merging releases v${headVersion} (${kind}).` };
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
