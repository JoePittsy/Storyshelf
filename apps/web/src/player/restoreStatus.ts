import { useSyncExternalStore } from 'react';

// Whether the restore-on-load has finished deciding: it either put a book in the player or found nothing to put there.
// A screen that needs the player (Now playing, on a reload) waits for this rather than concluding there is nothing.
let settled = false;
const listeners = new Set<() => void>();

export function markRestoreSettled(): void {
  if (settled) return;
  settled = true;
  listeners.forEach((cb) => cb());
}

export const useRestoreSettled = (): boolean =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => settled
  );
