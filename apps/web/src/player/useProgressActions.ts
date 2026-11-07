import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@joepittsy/ui';
import { progressChanged } from '../api/libraries';
import { changeProgress, undoProgressChange, type ProgressAction, type ProgressChange } from './progressActions';

/**
 * Everything that shows a book's progress: the book itself, the progress map (library grid, Continue listening, series),
 * the in-progress shelf, library lists (progress filters and the Recently listened sort), History's Finished list and
 * the series to carry on with (ABS's personalized shelves).
 */
export const progressQueryKeys = (itemId: string) =>
  [['item', itemId], ['me'], ['items-in-progress'], ['items'], ['finished'], ['personalized']] as const;

const DONE: Record<ProgressAction, string> = {
  finish: 'Marked as finished',
  unfinish: 'Marked as not finished',
  reset: 'Progress reset',
};
const FAILED: Record<ProgressAction, string> = {
  finish: "Couldn't mark this book as finished. Check your connection and try again.",
  unfinish: "Couldn't mark this book as not finished. Check your connection and try again.",
  reset: "Couldn't reset this book's progress. Check your connection and try again.",
};

/** These change the listener's place, so Undo stays long enough to reach for (as a chapter jump's does). */
export const UNDO_MS = 12000;

/**
 * Mark a book finished or not finished, or reset its progress, each with an Undo toast that puts back exactly what was
 * there. Undo rather than a confirm: nothing is lost that one tap can't restore. `busy` while a change or an Undo runs.
 */
export function useProgressActions() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    (itemId: string) => {
      progressChanged();
      for (const queryKey of progressQueryKeys(itemId)) void qc.invalidateQueries({ queryKey });
    },
    [qc]
  );

  const undo = useCallback(
    async (change: ProgressChange) => {
      setBusy(true);
      try {
        await undoProgressChange(change);
      } catch {
        showToast("Couldn't undo that. Check your connection and try again.", 'error');
      } finally {
        refresh(change.itemId);
        setBusy(false);
      }
    },
    [refresh, showToast]
  );

  const run = useCallback(
    async (itemId: string, action: ProgressAction) => {
      setBusy(true);
      try {
        const change = await changeProgress(itemId, action);
        showToast(DONE[action], 'info', {
          action: { label: 'Undo', shortcutKey: 'u', onClick: () => void undo(change) },
          durationMs: UNDO_MS,
          replaceKey: 'progress-change',
        });
      } catch {
        showToast(FAILED[action], 'error');
      } finally {
        refresh(itemId);
        setBusy(false);
      }
    },
    [refresh, showToast, undo]
  );

  return { run, busy };
}
