// Reads personas/<name>.md: the YAML front matter (flat key: value lines, which is all these files use) and the brief.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERSONAS_DIR } from './pw.mjs';

export const personaNames = () =>
  readdirSync(resolve(PERSONAS_DIR, 'personas'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));

export function loadPersona(name) {
  const file = resolve(PERSONAS_DIR, 'personas', `${name}.md`);
  if (!existsSync(file)) throw new Error(`No persona "${name}". Known: ${personaNames().join(', ')}`);
  const text = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: expected YAML front matter between --- lines`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  for (const key of ['name', 'account', 'device', 'model', 'tasks']) {
    if (!meta[key]) throw new Error(`${file}: front matter is missing "${key}"`);
  }
  return { ...meta, brief: m[2].trim(), tasksFile: resolve(PERSONAS_DIR, meta.tasks) };
}
