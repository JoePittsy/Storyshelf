export type NavAction = 'PUSH' | 'REPLACE' | 'POP';

export type ScrollPlan = { kind: 'keep' } | { kind: 'top' } | { kind: 'restore'; y: number };

/**
 * What the window scroll should do when the location changes. Back and forward (POP) restore where that entry was;
 * arriving at a different page starts at the top; changing only the query or hash on the same page (filters, search
 * text) leaves the scroll alone.
 */
export function planScroll(action: NavAction, from: string | null, to: string, saved: number | undefined): ScrollPlan {
  if (action === 'POP') return saved === undefined ? { kind: 'top' } : { kind: 'restore', y: saved };
  return from === to ? { kind: 'keep' } : { kind: 'top' };
}
