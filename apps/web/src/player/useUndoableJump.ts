import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@joepittsy/ui';
import { usePlayer } from './engine';
import { nextJump, previousJump, undoPoint } from './jumps';

/**
 * Jumping to a chapter loses the listener's place, so it comes with a way back. `go` seeks (or plays from) a time;
 * pass `previous` (the position before the jump) to get a toast with Undo, or null when there is no place to lose.
 */
export function useUndoableJump(go: (seconds: number) => void) {
  const { showToast } = useToast();
  return useCallback(
    (target: number, label: string, previous: number | null) => {
      go(target);
      if (previous === null) return;
      showToast(`Jumped to ${label}`, 'info', { action: { label: 'Undo', onClick: () => go(previous) }, durationMs: 8000 });
    },
    [go, showToast],
  );
}

/**
 * Every chapter move on the player (the chapter lists, previous/next buttons, the [ and ] keys) goes through here so
 * each one can be undone. The returned functions are stable; they read the player's latest state when called.
 */
export function usePlayerJump() {
  const p = usePlayer();
  const latest = useRef(p);
  useEffect(() => {
    latest.current = p;
  });
  const go = useCallback((t: number) => latest.current.seek(t), []);
  const jump = useUndoableJump(go);
  const jumpTo = useCallback(
    (target: number, label: string) => {
      const cur = latest.current;
      jump(target, label, undoPoint(cur.status, cur.position, target));
    },
    [jump],
  );
  const previousChapter = useCallback(() => {
    const j = previousJump(latest.current.chapters, latest.current.position);
    if (j) jumpTo(j.target, j.label);
    else latest.current.previousChapter();
  }, [jumpTo]);
  const nextChapter = useCallback(() => {
    const j = nextJump(latest.current.chapters, latest.current.position);
    if (j) jumpTo(j.target, j.label);
  }, [jumpTo]);
  return { jumpTo, previousChapter, nextChapter };
}
