import { useEffect, useMemo, useRef } from 'react';
import { useChapters, useInProgress } from '../api/history';
import { useProgress } from '../api/libraries';
import { refreshRestored, restore } from './engine';
import { markRestoreSettled } from './restoreStatus';
import { pickRestorable } from './restore';

/**
 * On load, puts the book the listener was last in back into the player, paused where they left it, so the mini
 * player is there to pick up from. It opens no session and loads no audio (see `restore`). Once per visit, and only
 * once what it needs has arrived; it renders nothing.
 *
 * Until the book is played, its place is a snapshot. When the tab wakes or gets focus the server's progress is
 * fetched again, and a later place there (another device) replaces the snapshot's.
 */
export function RestoreLastBook({
  libraryId,
  librariesPending,
}: {
  libraryId: string | undefined;
  librariesPending: boolean;
}) {
  const inProgress = useInProgress();
  const progress = useProgress();
  const done = useRef(false);
  const ready = !!libraryId && !inProgress.isPending && !progress.isPending;
  const pick = useMemo(
    () => (ready ? pickRestorable(inProgress.data, progress.data ?? new Map(), libraryId) : undefined),
    [ready, inProgress.data, progress.data, libraryId]
  );
  const chapters = useChapters(pick ? [pick.id] : []).get(pick?.id ?? '');
  useEffect(() => {
    if (done.current) return;
    if (!librariesPending && !libraryId) {
      // No book library at all: nothing to restore.
      done.current = true;
      return markRestoreSettled();
    }
    if (!ready) return;
    if (pick && chapters?.state === 'pending') return; // the book's chapters are on their way
    done.current = true;
    if (pick) restore(pick, chapters?.chapters ?? []);
    markRestoreSettled();
  }, [ready, pick, chapters, libraryId, librariesPending]);

  const refetch = progress.refetch;
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', wake);
    addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      removeEventListener('focus', wake);
    };
  }, [refetch]);
  useEffect(() => {
    if (progress.data) refreshRestored(progress.data);
  }, [progress.data]);
  return null;
}
