import { useSyncExternalStore } from 'react';
import { addMark, type Mark } from './bookHistory';

// The places left behind in each book (before a chapter jump, a big seek or an Undo, or another device's place), kept
// on this device so last night's are still there after iOS has closed the app. Forgotten on sign-out (main.tsx).
const KEY = 'storyshelf.jumpMarks';
/** Books whose marks are kept; the least recently marked go first. */
export const MAX_BOOKS = 20;

/** A seek further than this is a jump worth coming back from; shorter ones are just listening. */
export const BIG_SEEK_SECONDS = 120;

type Store = Record<string, Mark[]>;

const isMark = (m: unknown): m is Mark => {
  const v = m as Partial<Mark> | null;
  return (
    !!v &&
    typeof v.position === 'number' &&
    typeof v.at === 'number' &&
    (v.to === undefined || typeof v.to === 'number') &&
    (v.device === undefined || typeof v.device === 'boolean')
  );
};

function load(): Store {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Store = {};
    for (const [id, list] of Object.entries(v)) if (Array.isArray(list)) out[id] = list.filter(isMark);
    return out;
  } catch {
    return {};
  }
}

let store: Store = load();
const listeners = new Set<() => void>();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Private mode or storage blocked: the marks last this visit.
  }
  listeners.forEach((l) => l());
}

/**
 * Remember where the listener was before leaving it: `to` is where the jump went, `device` marks another device's
 * place rather than one this device left.
 */
export function recordJump(
  itemId: string,
  position: number,
  extra: { to?: number; device?: boolean } = {},
  at = Date.now()
): void {
  const list = store[itemId] ?? [];
  const mark: Mark = { position, at };
  if (extra.to !== undefined && Number.isFinite(extra.to)) mark.to = extra.to;
  if (extra.device) mark.device = true;
  const next = addMark(list, mark);
  if (next === list) return;
  // This book moves to the end; the oldest books beyond the cap go.
  const rest = Object.entries(store).filter(([id]) => id !== itemId);
  store = Object.fromEntries([...rest.slice(-(MAX_BOOKS - 1)), [itemId, next]]);
  save();
}

/** Signing out: this device keeps nothing of the user's. */
export function clearJumpLog(): void {
  store = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const none: Mark[] = [];

/** The jump marks for a book, oldest first. */
export const useJumpMarks = (itemId: string): Mark[] => useSyncExternalStore(subscribe, () => store[itemId] ?? none);

/** For tests. */
export const resetJumpLog = clearJumpLog;
