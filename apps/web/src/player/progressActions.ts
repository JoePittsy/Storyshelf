import { getProgress, removeProgress, restoreProgress, setFinished, type ProgressSnapshot } from './bookProgress';
import { release, restore, type Released } from './engine';

export type ProgressAction = 'finish' | 'unfinish' | 'reset';

/** A change made to a book's progress, with everything its Undo needs. */
export interface ProgressChange {
  action: ProgressAction;
  itemId: string;
  /** The progress just before the change (null: there was none). */
  prev: ProgressSnapshot | null;
  /** What the player held of this book before the change took it out (null: it hadn't got it). */
  held: Released | null;
}

/**
 * Marks a book finished or not finished, or resets it. If the book is in the player it comes out first (its last place
 * saved, the session closed), so nothing the player sends can undo the change and a later Play starts from the server's
 * new place. The snapshot for Undo is read after that, so it includes the place the player last saved.
 */
export async function changeProgress(itemId: string, action: ProgressAction): Promise<ProgressChange> {
  const held = await release(itemId);
  const prev = await getProgress(itemId);
  if (action === 'reset') {
    if (prev) await removeProgress(prev.id);
  } else await setFinished(itemId, action === 'finish');
  return { action, itemId, prev, held };
}

/**
 * Puts the book's progress back as it was before `change`. If it has been played since, that stops first. If the
 * change took the book out of the player, and the player is still empty, the book goes back in, paused at the restored
 * place with no session (as on load), so the mini player is where it was.
 */
export async function undoProgressChange(change: ProgressChange): Promise<void> {
  await release(change.itemId);
  await restoreProgress(change.itemId, change.prev);
  const { held, prev } = change;
  if (!held) return;
  restore(
    { ...held.restorable, position: prev?.currentTime ?? held.restorable.position, updatedAt: prev?.lastUpdate ?? 0 },
    held.chapters
  );
}
