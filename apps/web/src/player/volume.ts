// The player's own volume, for browsers that let a page set it. Kept apart from the other player settings: it is this
// device's, and iOS has none (the hardware buttons own the volume there, and `audio.volume` can't be set).

const KEY = 'storyshelf.volume';

/** A level from 0 to 1; anything else is full volume. */
export const clampVolume = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;

/** The level last chosen on this device, or full volume. */
export function loadVolume(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? 1 : clampVolume(JSON.parse(raw));
  } catch {
    return 1;
  }
}

export function saveVolume(v: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clampVolume(v)));
  } catch {
    // Private mode or storage blocked: the level lasts for this page only.
  }
}

let settable: boolean | null = null;

/**
 * Whether this browser lets a page set an <audio> element's volume. iOS doesn't: the setter does nothing and the
 * value still reads 1. Asked of a throwaway element, once.
 */
export function canSetVolume(): boolean {
  if (settable !== null) return settable;
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    settable = probe.volume === 0.5;
  } catch {
    settable = false;
  }
  return settable;
}
