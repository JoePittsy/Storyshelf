export const SYNC_INTERVAL_S = 10;

/** listened: real s since last sync; lastSynced: book time last sent */
export interface SyncClock {
  listened: number;
  lastSynced: number;
}

export function startClock(currentTime: number): SyncClock {
  return { listened: 0, lastSynced: currentTime };
}

export function tick(c: SyncClock, playingS: number): SyncClock {
  return { ...c, listened: c.listened + playingS };
}

/** listened >= SYNC_INTERVAL_S */
export function dueWhilePlaying(c: SyncClock): boolean {
  return c.listened >= SYNC_INTERVAL_S;
}

/** On pause, seek-while-paused, hide or close: true if anything was listened or the position moved >= 1 s since lastSynced. */
export function dueOnStop(c: SyncClock, currentTime: number): boolean {
  return c.listened > 0 || Math.abs(currentTime - c.lastSynced) >= 1;
}

/** timeListened is sent as-is, unrounded. */
export function payload(
  c: SyncClock,
  currentTime: number,
  duration: number
): { currentTime: number; timeListened: number; duration: number } {
  return { currentTime, timeListened: c.listened, duration };
}

export function markSynced(currentTime: number): SyncClock {
  return { listened: 0, lastSynced: currentTime };
}
