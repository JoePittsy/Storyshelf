import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@joepittsy/ui';
import { usePlayer } from './engine';
import { nextJump, previousJump, undoPoint, MIN_UNDO_DISTANCE } from './jumps';
import { BIG_SEEK_SECONDS, recordJump } from './jumpLog';

/**
 * Jumping to a chapter loses the listener's place, so it comes with a way back. `go` seeks (or plays from) a time;
 * pass `previous` (the position before the jump) to get a toast with Undo, or null when there is no place to lose.
 */
export function useUndoableJump(go: (seconds: number) => void) {
  const { showToast } = useToast();
  // A run of jumps shows one toast whose Undo returns to where the run started, not to the last hop.
  const chain = useRef<{ from: number; until: number } | null>(null);
  return useCallback(
    (target: number, label: string, previous: number | null) => {
      go(target);
      if (previous === null) return;
      const now = Date.now();
      const from = chain.current && now < chain.current.until ? chain.current.from : previous;
      chain.current = { from, until: now + UNDO_MS };
      showToast(`Jumped to ${label}`, 'info', {
        action: {
          label: 'Undo',
          shortcutKey: 'u',
          onClick: () => {
            chain.current = null;
            go(from);
          },
        },
        durationMs: UNDO_MS,
        replaceKey: 'chapter-jump',
      });
    },
    [go, showToast],
  );
}

/** A jump can lose a long listen, so Undo stays long enough to reach for. */
const UNDO_MS = 12000;

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
  // Every move through here, Undo included, keeps the place it left. The engine logs the big ones itself, so only the shorter ones are added here.
  const go = useCallback((t: number) => {
    const { item, position, seek } = latest.current;
    const dist = Math.abs(t - position);
    if (item && dist >= MIN_UNDO_DISTANCE && dist <= BIG_SEEK_SECONDS) recordJump(item.id, position);
    seek(t);
  }, []);
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
