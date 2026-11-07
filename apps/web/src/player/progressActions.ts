import {
  getProgress,
  hideFromContinueListening,
  removeProgress,
  restoreProgress,
  setFinished,
  type ProgressSnapshot,
} from './bookProgress';
import { release, restore, type Released } from './engine';

/** `hide`: remove from Continue listening, keeping the place. */
export type ProgressAction = 'finish' | 'unfinish' | 'reset' | 'hide';

/** A change made to a book's progress, with everything its Undo needs. */
export interface ProgressChange {
  action: ProgressAction;
  itemId: string;
  /** The progress just before the change (null: there was none). */
  prev: ProgressSnapshot | null;
  /** What the player held of this book before the change took it out (null: it hadn't got it). */
  held: Released | null;
  /** Which change this was; only the latest one can be undone. */
  seq: number;
}

// One change or Undo at a time. Besides keeping each one's reads and writes together, this matters to ABS itself:
// 2.37.2 crashes (an unhandled rejection takes the whole server down) when a PATCH carrying `lastUpdate` meets a DELETE
// of the same record, which an Undo overlapping a reset would do.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

let latest = 0;

/**
 * Marks a book finished or not finished, resets it, or removes it from Continue listening. If the book is in the player
 * it comes out first (its last place saved, the session closed), so nothing the player sends can undo the change (a
 * sync that moves the place would put a removed book back on Continue listening) and a later Play starts from the
 * server's new place. The snapshot for Undo is read after that, so it includes the place the player last saved. Starting a change
 * retires the Undo of every earlier one.
 */
export function changeProgress(itemId: string, action: ProgressAction): Promise<ProgressChange> {
  const seq = ++latest;
  return serial(async () => {
    const held = await release(itemId);
    const prev = await getProgress(itemId);
    if (action === 'reset') {
      if (prev) await removeProgress(prev.id);
    } else if (action === 'hide') {
      if (prev && !prev.hideFromContinueListening) await hideFromContinueListening(prev.id);
    } else await setFinished(itemId, action === 'finish');
    return { action, itemId, prev, held, seq };
  });
}

/**
 * Puts the book's progress back as it was before `change`. If it has been played since, that stops first. If the
 * change took the book out of the player, and the player is still empty, the book goes back in, paused at the restored
 * place with no session (as on load), so the mini player is where it was. Resolves false, doing nothing, when a later
 * change (or this Undo already) has retired it: undoing it then would undo the later change too.
 */
export function undoProgressChange(change: ProgressChange): Promise<boolean> {
  if (change.seq !== latest) return Promise.resolve(false);
  latest++;
  return serial(async () => {
    await release(change.itemId);
    await restoreProgress(change.itemId, change.prev);
    const { held, prev } = change;
    if (held)
      restore(
        {
          ...held.restorable,
          position: prev?.currentTime ?? held.restorable.position,
          updatedAt: prev?.lastUpdate ?? 0,
        },
        held.chapters
      );
    return true;
  });
}
