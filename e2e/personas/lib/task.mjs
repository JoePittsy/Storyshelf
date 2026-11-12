// How a task is written. A task is a small async function that drives the app and returns one result record:
//
//   { id, title, pass, steps, seconds, note }          (+ skipped: true, scriptError: true, errors: n when they apply)
//
// `pass` is decided by an explicit check in the task, never by "nothing threw". Three different outcomes are kept apart,
// because last time they were mixed up:
//   - the app did not do what the task expects      -> pass: false              (a product result)
//   - the task cannot be run here (no service worker, no audio…) -> skipped: true (says why; not a failure)
//   - the task's own code broke (bad selector, timeout waiting for something the task assumed) -> pass: false, scriptError: true
// Anything thrown is a script error. A task that wants a missing control to count as a product failure checks for it
// with `see()` and returns `{ pass: false, note }` itself.

/** Polls `fn` until it returns something truthy; returns that value, or the last falsy one on timeout. */
export async function poll(fn, { timeout = 15_000, interval = 250 } = {}) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await Promise.resolve().then(fn).catch(() => undefined);
    if (last || Date.now() >= end) return last;
    await new Promise((r) => setTimeout(r, interval));
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} id     stable id, e.g. "dan-sleep-before-play": scorecards are compared by it
 * @param {string} title  what the person is trying to do, in plain words
 * @param {(t: object) => Promise<{pass: boolean, note?: string} | {skip: string}>} fn
 *        `t` is the run context plus: step(label), see(locator, what, ms), until(fn, ms), skip(reason), onDone(fn)
 */
export function defineTask(id, title, fn) {
  const task = async (ctx) => {
    const labels = [];
    const cleanups = [];
    const started = Date.now();
    const errorsBefore = ctx.errors.length;
    const t = {
      ...ctx,
      id,
      /** Counts one thing the person did (a tap, a key, a navigation). Reported as `steps`. */
      step: (label) => void labels.push(label),
      /** Waits for the locator to be visible; returns true/false instead of throwing. */
      see: (locator, ms = 10_000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false),
      until: (check, ms = 15_000) => poll(check, { timeout: ms }),
      skip: (reason) => ({ skip: reason }),
      /** Runs after the task, pass or fail: put back what the task changed (a timer, a speed, a bookmark). */
      onDone: (undo) => void cleanups.push(undo),
    };
    let result;
    try {
      result = await fn(t);
    } catch (e) {
      result = { pass: false, scriptError: true, note: `Script error: ${String(e?.message ?? e).split('\n')[0]}` };
    }
    for (const undo of cleanups.reverse()) await Promise.resolve(undo()).catch(() => undefined);
    const record = {
      id,
      title,
      pass: result.skip ? null : !!result.pass,
      steps: labels.length,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      note: result.skip ? `Skipped: ${result.skip}` : (result.note ?? ''),
      stepLog: labels,
      errors: ctx.errors.length - errorsBefore,
    };
    if (result.skip) record.skipped = true;
    if (result.scriptError) record.scriptError = true;
    return record;
  };
  task.id = id;
  task.title = title;
  return task;
}
