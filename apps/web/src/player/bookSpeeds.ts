import { useSyncExternalStore } from 'react';
import { clampRate } from './settings';

// The speed each book was last set to, on this device, most recently set last. ABS has no per-book speed, so it lives
// here, like the other player settings. A book with no entry plays at the default speed from Settings.
const KEY = 'storyshelf.bookSpeeds';
/** Enough for every book anyone is part-way through; the oldest settings go first. */
export const MAX_BOOK_SPEEDS = 200;

export type BookSpeedEntry = [id: string, rate: number];

function load(): BookSpeedEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number' && Number.isFinite(e[1]))
      .map(([id, r]): BookSpeedEntry => [id, clampRate(r)]);
  } catch {
    return [];
  }
}

let entries = load();
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

function save(next: BookSpeedEntry[]): void {
  entries = next.slice(-MAX_BOOK_SPEEDS);
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Private mode or storage blocked: the speeds last for this visit.
  }
  listeners.forEach((cb) => cb());
}

/** The speed this book was set to here, or undefined when it follows the default. */
export function bookSpeed(id: string): number | undefined {
  return entries.find(([x]) => x === id)?.[1];
}

/**
 * Remember a book's speed. A speed equal to the default is forgotten instead, so the book follows the default from
 * then on (the speed was put back to normal, so there is nothing of its own to keep).
 */
export function rememberBookSpeed(id: string, rate: number, defaultRate: number): void {
  const rest = entries.filter(([x]) => x !== id);
  if (rate === defaultRate) {
    if (rest.length !== entries.length) save(rest);
    return;
  }
  save([...rest, [id, rate]]);
}

/** Forget every book's speed. Returns what was forgotten, for Undo. */
export function forgetBookSpeeds(): BookSpeedEntry[] {
  const was = entries;
  save([]);
  return was;
}

/** Undo for `forgetBookSpeeds`. */
export function putBackBookSpeeds(list: BookSpeedEntry[]): void {
  const ids = new Set(list.map(([id]) => id));
  save([...list, ...entries.filter(([id]) => !ids.has(id))]);
}

/** How many books have a speed of their own. */
export const useBookSpeedCount = (): number => useSyncExternalStore(subscribe, () => entries).length;

