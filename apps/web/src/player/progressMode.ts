import { useEffect, useSyncExternalStore } from 'react';
import { usePlayer } from './engine';
import { progressWindow, resolveMode, type ProgressMode, type ProgressWindow } from './progressWindow';

const KEY = 'storyshelf.progressMode';
const MODES: ProgressMode[] = ['book', 'chapter', 'sleep'];

interface Stored {
  mode: ProgressMode;
  /** The last non-Sleep choice: where Sleep falls back to when its timer ends. */
  last: ProgressMode;
}

const isMode = (v: unknown): v is ProgressMode => MODES.includes(v as ProgressMode);

/** The remembered choice for this device (REQ-45). Storage failures or junk give Book. */
export function loadProgressMode(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<keyof Stored, unknown>>;
    const mode = isMode(raw.mode) ? raw.mode : 'book';
    return { mode, last: isMode(raw.last) && raw.last !== 'sleep' ? raw.last : 'book' };
  } catch {
    return { mode: 'book', last: 'book' };
  }
}

let current = loadProgressMode();
const listeners = new Set<() => void>();

/** Choose a mode and remember it. */
export function chooseProgressMode(mode: ProgressMode): void {
  current = { mode, last: mode === 'sleep' ? current.last : mode };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  listeners.forEach((l) => l());
}

/** Test seam: forget the in-memory choice and re-read storage. */
export function reloadProgressMode(): void {
  current = loadProgressMode();
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The progress bar's mode and window for the playing book. Shared by the bottom bar and the full player. */
export function useProgress(): {
  mode: ProgressMode;
  setMode: (m: ProgressMode) => void;
  sleepActive: boolean;
  window: ProgressWindow;
} {
  const p = usePlayer();
  const stored = useSyncExternalStore(subscribe, () => current);
  const sleepActive = p.sleep !== null;
  const mode = resolveMode(stored.mode, stored.last, sleepActive);
  // When the timer ends in Sleep mode, go back to the previous choice for good.
  useEffect(() => {
    if (stored.mode === 'sleep' && !sleepActive) chooseProgressMode(stored.last);
  }, [stored, sleepActive]);
  return {
    mode,
    setMode: chooseProgressMode,
    sleepActive,
    window: progressWindow(mode, p),
  };
}
