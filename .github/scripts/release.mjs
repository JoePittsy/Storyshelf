// Release rules for pull requests into main, shared by the release-check and tag-release workflows.
//
//   node .github/scripts/release.mjs check <base-version> <head-version> <labels-json> <body-file>
//     A PR into main carries exactly one release label. major, minor or patch: the head version must be the base
//     version bumped that way, and the body needs a non-empty "## Release notes" section. none: the version must not
//     change. Prints what will happen; exits 1 with the reason otherwise.
//
//   node .github/scripts/release.mjs notes <body-file>
//     Prints the "## Release notes" section of a PR body (empty if there is none).
import { readFileSync } from 'node:fs';

export const LABELS = { 'release: major': 'major', 'release: minor': 'minor', 'release: patch': 'patch', 'release: none': 'none' };

/** "1.2.3" bumped by kind. Pre-release suffixes are not part of this flow. */
export function bump(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`"${version}" is not MAJOR.MINOR.PATCH`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  if (kind === 'none') return version;
  throw new Error(`unknown bump "${kind}"`);
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

/** The verdict for a PR: { ok: true, message } or { ok: false, message }. */
export function checkPr({ baseVersion, headVersion, labels, body }) {
  const kinds = labels.filter((l) => l in LABELS).map((l) => LABELS[l]);
  const names = Object.keys(LABELS).map((l) => `"${l}"`).join(', ');
  if (kinds.length === 0) return { ok: false, message: `Add one release label: ${names}.` };
  if (kinds.length > 1) return { ok: false, message: `Use one release label, not ${kinds.length}.` };
  const kind = kinds[0];
  const expected = bump(baseVersion, kind);
  if (kind === 'none') {
    return headVersion === baseVersion
      ? { ok: true, message: `No release. apps/web stays at ${baseVersion}.` }
      : { ok: false, message: `"release: none" but apps/web/package.json changed ${baseVersion} → ${headVersion}. Put it back, or label the release.` };
  }
  if (headVersion !== expected) {
    return {
      ok: false,
      message: `"release: ${kind}" means ${baseVersion} → ${expected}, but apps/web/package.json says ${headVersion}. Run: pnpm --filter @storyshelf/web version ${expected} --no-git-tag-version`,
    };
  }
  if (!releaseNotes(body)) return { ok: false, message: 'Add a "## Release notes" section to the PR description. It becomes the GitHub Release text.' };
  return { ok: true, message: `Merging releases v${expected} (${kind}).` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'check') {
    const [baseVersion, headVersion, labelsJson, bodyFile] = args;
    const r = checkPr({ baseVersion, headVersion, labels: JSON.parse(labelsJson), body: readFileSync(bodyFile, 'utf8') });
    console.log(r.message);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'notes') {
    process.stdout.write(releaseNotes(readFileSync(args[0], 'utf8')));
  } else {
    console.error('usage: release.mjs check <base> <head> <labels-json> <body-file> | notes <body-file>');
    process.exit(2);
  }
}
