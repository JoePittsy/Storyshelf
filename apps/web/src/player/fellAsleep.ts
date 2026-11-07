import { useSyncExternalStore } from 'react';
import { chapterIndexAt, type Chapter } from './chapters';
import { REWIND_CAP_SECONDS } from './rewind';

/** Where the sleep timer stopped a book, and the place to offer going back to. */
export interface FellAsleep {
  itemId: string;
  /** Book seconds: where the timer began, or the start of the chapter it stopped in when that is later. */
  target: number;
  /** The chapter index when `target` is that chapter's start; null when it is where the timer began. */
  chapter: number | null;
  /** Book seconds: where the timer paused playback. */
  stoppedAt: number;
}

/**
 * Where to offer to go back to when the sleep timer pauses at `stoppedAt`: where the timer was set (`sleepFrom`), the
 * last moment the listener was surely awake; or, if the chapter it stopped in began later than that, the chapter's
 * start, a clean place to pick up from. Null when that is no further back than the rewind on resume already goes.
 */
export function fellAsleepPlace(
  sleepFrom: number,
  chapters: Chapter[],
  stoppedAt: number
): { target: number; chapter: number | null } | null {
  const i = chapterIndexAt(chapters, stoppedAt);
  const cur = chapters[i];
  const byChapter = !!cur && cur.start > sleepFrom;
  const target = byChapter ? cur.start : sleepFrom;
  if (!(stoppedAt - target > REWIND_CAP_SECONDS)) return null;
  return { target, chapter: byChapter ? i : null };
}

// One record, for the last book the timer stopped, kept on this device so the offer is still there the morning after
// (iOS will have closed the app overnight).
const KEY = 'storyshelf.fellAsleep';
/** The pause lands a moment after the timer fires, and ABS keeps the place to a fraction of a second. */
const SAME_PLACE_S = 2;

function load(): FellAsleep | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<FellAsleep> | null;
    if (!v || typeof v.itemId !== 'string' || typeof v.target !== 'number' || typeof v.stoppedAt !== 'number')
      return null;
    return {
      itemId: v.itemId,
      target: v.target,
      stoppedAt: v.stoppedAt,
      chapter: typeof v.chapter === 'number' ? v.chapter : null,
    };
  } catch {
    return null;
  }
}

let current = load();
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

function put(next: FellAsleep | null): void {
  if (next === current) return;
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or storage blocked: the offer lasts for this visit.
  }
  listeners.forEach((cb) => cb());
}

/** The sleep timer has just paused a book: offer its place back. */
export const rememberFellAsleep = (r: FellAsleep): void => put(r);
/** Playback started, the place moved, or the offer was used: it goes. */
export const forgetFellAsleep = (): void => put(null);

/**
 * The offer for the book in the player, or null. It shows only while that book sits paused where the timer stopped it:
 * a seek, or another device moving the place on, takes it away even before anything forgets it.
 */
export function useFellAsleep(itemId: string | undefined, position: number, status: string): FellAsleep | null {
  const r = useSyncExternalStore(subscribe, () => current);
  if (!r || r.itemId !== itemId || status === 'playing' || status === 'loading') return null;
  return Math.abs(position - r.stoppedAt) <= SAME_PLACE_S ? r : null;
}
