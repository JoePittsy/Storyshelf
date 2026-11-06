// The pure decisions behind resuming playback. The engine feeds them facts from the <audio> element.

export type Intent = 'play' | 'pause' | 'toggle';

/** What to do with the element. Decided on the element's own `paused`, never on our status, which can lag it. */
export function decide(intent: Intent, paused: boolean): 'play' | 'pause' | 'none' {
  if (intent === 'play') return paused ? 'play' : 'none';
  if (intent === 'pause') return paused ? 'none' : 'pause';
  return paused ? 'play' : 'pause';
}

export const STALL_MS = 3000;

/** True when play() was requested at least `limit` ms ago and `playing` still hasn't fired. Times are performance.now(). */
export function stalledFor(requestedAt: number | null, now: number, limit = STALL_MS): boolean {
  return requestedAt !== null && now - requestedAt >= limit;
}

export interface RetryOnce {
  /** True the first time after a reset, false until the next reset. */
  attempt(): boolean;
  reset(): void;
}

/** One reload-and-retry per resume: re-arms when playback really starts. */
export function createRetryOnce(): RetryOnce {
  let used = false;
  return {
    attempt() {
      if (used) return false;
      used = true;
      return true;
    },
    reset() {
      used = false;
    },
  };
}
