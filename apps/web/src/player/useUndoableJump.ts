import { useCallback } from 'react';
import { useToast } from '@joepittsy/ui';

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
