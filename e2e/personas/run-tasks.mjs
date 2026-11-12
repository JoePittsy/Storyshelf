#!/usr/bin/env node
// Runs one persona's fixed task list and writes a scorecard.
//
//   node e2e/personas/run-tasks.mjs <persona> [--fresh] [--url <app url>] [--out <folder>] [--account <abs user>] [--only <task id>]
//
// Same tasks, same order, every run: that is what makes two scorecards comparable. The browser profile persists between
// runs (see lib/session.mjs); --fresh starts from a new device. Exit status: 0 when every task ran (even if some
// failed: a failed task is a result), 1 when the harness itself broke (the app or ABS is down, or a task threw).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PERSONAS_DIR } from './lib/pw.mjs';
import { absUrl, appUrl } from './lib/env.mjs';
import { absSession } from './lib/abs.mjs';
import { loadPersona, personaNames } from './lib/persona.mjs';
import { RUNS_DIR, openSession, shot } from './lib/session.mjs';

function parseArgs(argv) {
  const o = { persona: undefined, fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fresh') o.fresh = true;
    else if (['--url', '--out', '--account', '--only'].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else if (!o.persona) o.persona = a.toLowerCase();
  }
  if (!o.persona) throw new Error(`Usage: run-tasks.mjs <persona> [--fresh] [--url …] [--out …] [--account …] [--only <task id>]\nPersonas: ${personaNames().join(', ')}`);
  return o;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Resets the persona's server-side starting state when the infrastructure's script is there; says so either way. */
function seed(account) {
  // PERSONA_SEED_SCRIPT points at another copy (a checkout that has it, while this one doesn't yet).
  const script = process.env.PERSONA_SEED_SCRIPT || resolve(PERSONAS_DIR, '..', 'seed-personas.sh');
  if (!existsSync(script)) return 'not run (e2e/seed-personas.sh is not in this checkout)';
  const r = spawnSync('bash', [script, '--only', account], { encoding: 'utf8' });
  return r.status === 0 ? `reset ${account}` : `seed-personas.sh failed for ${account} (exit ${r.status}); carrying on with whatever state is there`;
}

/** Whether the page is controlled by a service worker (a production build, after its first load). */
async function hasServiceWorker(page) {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && (reg.active || reg.waiting)) && !!navigator.serviceWorker.controller;
  }).catch(() => false);
}

const md = (card) => {
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  const status = (t) => (t.skipped ? 'skip' : t.pass ? 'pass' : t.scriptError ? 'SCRIPT ERROR' : 'FAIL');
  const rows = card.tasks.map((t) => `| ${t.id} | ${cell(t.title)} | ${status(t)} | ${t.steps} | ${t.seconds} | ${cell(t.note)} |`);
  const s = card.summary;
  return [
    `# Scorecard: ${card.persona} (${card.device}, account ${card.account})`,
    '',
    `App ${card.url}, ${card.fresh ? 'fresh profile (a new device)' : 'persistent profile'}, service worker: ${card.serviceWorker ? 'yes' : 'no'}. ${card.startedAt}`,
    `Server state: ${card.seeded}.`,
    ...(card.build?.current === false
      ? [`**Old release under test:** the page ran ${card.build.running}, the server has ${card.build.served}. These results are not for the current build; run again.`]
      : card.build?.running
        ? [`Build ${card.build.running}${card.build.current ? ", the server's current one" : ''}.`]
        : []),
    '',
    `Passed ${s.passed}, failed ${s.failed}, skipped ${s.skipped}, script errors ${s.scriptErrors}.`,
    '',
    '| Task | What | Result | Steps | Seconds | Note |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    card.notCovered.length ? `Not covered here: ${card.notCovered.join('; ')}.` : '',
    '',
  ].join('\n');
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.url) process.env.STORYSHELF_URL = args.url;
  if (args.account) process.env.PERSONA_ACCOUNT = args.account;
  const persona = loadPersona(args.persona);
  const account = (args.account || process.env.PERSONA_ACCOUNT || persona.account).toLowerCase();
  const out = resolve(args.out || process.env.PERSONA_OUT || resolve(RUNS_DIR, `${persona.name}-${stamp()}`));
  mkdirSync(out, { recursive: true });
  process.env.PERSONA_OUT = out;

  for (const [what, url, path] of [['The app', appUrl(), '/'], ['Audiobookshelf', absUrl(), '/status']]) {
    const ok = await fetch(url + path, { signal: AbortSignal.timeout(8000) }).then((r) => r.ok, () => false);
    if (!ok) throw new Error(`${what} isn't answering at ${url}${path}. Start it first (e2e/README.md), or pass --url.`);
  }

  const seeded = seed(account);
  const mod = await import(pathToFileURL(persona.tasksFile).href);
  let tasks = mod.tasks;
  if (args.only) tasks = tasks.filter((t) => t.id === args.only);
  if (!tasks?.length) throw new Error(`${persona.tasksFile} exports no tasks${args.only ? ` named ${args.only}` : ''}`);

  let session = await openSession({ persona: persona.name, device: persona.device, fresh: args.fresh, account, out });
  const abs = await absSession(persona.name, account);
  let other;
  const ctx = {
    persona: persona.name,
    account,
    device: persona.device,
    fresh: args.fresh,
    session,
    page: session.page,
    context: session.context,
    errors: session.errors,
    go: session.go,
    url: session.url,
    out,
    abs,
    shot: (name) => shot(ctx.page, name),
    hasServiceWorker: () => hasServiceWorker(ctx.page),
    /**
     * Closes the browser and opens it again on the same profile: "closing the laptop and coming back tomorrow". Returns
     * the new session; later tasks get it too. (The running task's own `t.page` still points at the old one.)
     */
    reopen: async () => {
      const errors = session.errors;
      await session.close();
      session = await openSession({ persona: persona.name, device: persona.device, account, out });
      session.errors.unshift(...errors); // one error list for the whole run
      Object.assign(ctx, { session, page: session.page, context: session.context, errors: session.errors, go: session.go });
      return session;
    },
    /** The second device of a two-device persona (joe): opened on first use, with its own profile. */
    other: async () => (other ??= await openSession({ persona: persona.name, device: mod.secondDevice ?? 'phone', fresh: args.fresh, account, out })),
  };

  const results = [];
  try {
    for (const task of tasks) {
      process.stdout.write(`${task.id} ... `);
      const r = await task(ctx);
      if (r.pass === false) await shot(session.page, `failed-${r.id}`).catch(() => undefined);
      await session.context.setOffline(false).catch(() => undefined);
      if (other) await other.context.setOffline(false).catch(() => undefined);
      results.push(r);
      console.log(r.skipped ? 'skip' : r.pass ? 'pass' : r.scriptError ? 'SCRIPT ERROR' : 'FAIL', `(${r.seconds}s)${r.pass ? '' : ' ' + r.note}`);
    }
  } finally {
    const serviceWorker = await hasServiceWorker(session.page);
    const card = {
      persona: persona.name,
      device: persona.device,
      account,
      url: session.url,
      fresh: args.fresh,
      serviceWorker,
      build: session.build ?? null,
      startedAt: new Date().toISOString(),
      seeded,
      tasks: results,
      notCovered: mod.notCovered ?? [],
      consoleErrors: [...session.errors, ...(other?.errors ?? [])].map(({ kind, text, url }) => ({ kind, text: text.slice(0, 300), url })),
      summary: {
        passed: results.filter((t) => t.pass).length,
        failed: results.filter((t) => t.pass === false && !t.scriptError).length,
        skipped: results.filter((t) => t.skipped).length,
        scriptErrors: results.filter((t) => t.scriptError).length,
      },
    };
    writeFileSync(resolve(out, 'scorecard.json'), JSON.stringify(card, null, 2));
    writeFileSync(resolve(out, 'scorecard.md'), md(card));
    await session.close();
    if (other) await other.close();
    console.log(`\n${md(card)}\nWritten to ${out}`);
    process.exitCode = card.summary.scriptErrors > 0 ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
