import { useEffect, useMemo, useRef } from 'react';
import { useChapters, useInProgress } from '../api/history';
import { useProgress } from '../api/libraries';
import { restore } from './engine';
import { pickRestorable } from './restore';

/**
 * On load, puts the book the listener was last in back into the player, paused where they left it, so the mini
 * player is there to pick up from. It opens no session and loads no audio (see `restore`). Once per visit, and only
 * once what it needs has arrived; it renders nothing.
 */
export function RestoreLastBook({ libraryId }: { libraryId: string | undefined }) {
  const inProgress = useInProgress();
  const progress = useProgress();
  const done = useRef(false);
  const ready = !!libraryId && !inProgress.isPending && !progress.isPending;
  const pick = useMemo(
    () => (ready ? pickRestorable(inProgress.data, progress.data ?? new Map(), libraryId) : undefined),
    [ready, inProgress.data, progress.data, libraryId],
  );
  const chapters = useChapters(pick ? [pick.id] : []).get(pick?.id ?? '');
  useEffect(() => {
    if (done.current || !ready) return;
    if (pick && chapters?.state === 'pending') return; // the book's chapters are on their way
    done.current = true;
    if (pick) restore(pick, chapters?.chapters ?? []);
  }, [ready, pick, chapters]);
  return null;
}
