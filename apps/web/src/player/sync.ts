// STUB: tests-first. Behaviour is specified by sync.test.ts. Do not edit the tests.
export const SYNC_INTERVAL_S = 10;

/** listened: real s since last sync; lastSynced: book time last sent */
export interface SyncClock {
  listened: number;
  lastSynced: number;
}

export function startClock(_currentTime: number): SyncClock {
  throw new Error('not implemented');
}

export function tick(_c: SyncClock, _playingS: number): SyncClock {
  throw new Error('not implemented');
}

/** listened >= SYNC_INTERVAL_S */
export function dueWhilePlaying(_c: SyncClock): boolean {
  throw new Error('not implemented');
}

/** On pause, seek-while-paused, hide or close: true if anything was listened or the position moved >= 1 s since lastSynced. */
export function dueOnStop(_c: SyncClock, _currentTime: number): boolean {
  throw new Error('not implemented');
}

/** timeListened rounded to whole seconds is NOT required; send as-is */
export function payload(
  _c: SyncClock,
  _currentTime: number,
  _duration: number,
): { currentTime: number; timeListened: number; duration: number } {
  throw new Error('not implemented');
}

export function markSynced(_currentTime: number): SyncClock {
  throw new Error('not implemented');
}
