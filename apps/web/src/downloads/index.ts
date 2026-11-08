/**
 * Downloads: books kept on the device to play with no connection. This is the module's public face, which the rest
 * of the app reads (the offline home, the book page, Settings). The files live in OPFS and the details in IndexedDB
 * (storage.ts); the manager (manager.ts) downloads them. Keep these names and shapes stable.
 */
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { restoreSession } from '../api/auth';
import { rememberedUser } from '../api/lastUser';
import { absNet, browserEnv, downloadsSupported } from './browser';
import { DownloadManager, type StartResult } from './manager';
import { canDownload } from './plan';
import { idbMeta, opfsFiles } from './storage';
import type { DownloadedBook, DownloadedItem } from './types';

export type { DownloadStatus, DownloadedBook, DownloadedItem, SavedTrack } from './types';
export type { StartResult } from './manager';
export { canDownload, fmtBytes, percentOf } from './plan';
export { downloadsSupported } from './browser';

let books: DownloadedBook[] = [];
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const snapshot = (): DownloadedBook[] => books;

function publish(next: DownloadedBook[]): void {
  books = next;
  listeners.forEach((cb) => cb());
}

/** Every download, newest first. A new array whenever anything about one changes. */
export const useDownloads = (): DownloadedBook[] => useSyncExternalStore(subscribe, snapshot, snapshot);

/** Calls back whenever anything about the downloads changes (the player hears of a removal this way). Returns the unsubscribe. */
export const onDownloadsChange = (cb: () => void): (() => void) => subscribe(cb);

/** The download for a book, if any. */
export const downloadOf = (itemId: string): DownloadedBook | undefined => books.find((b) => b.itemId === itemId);

/** A book that is on the device in full and can play with no connection. */
export const isDownloaded = (itemId: string): boolean => downloadOf(itemId)?.status === 'complete';

/** For tests and stories: replace what the store holds. */
export function setDownloadsForTests(next: DownloadedBook[]): void {
  publish(next);
}

// --- the manager ------------------------------------------------------------------------------

let manager: DownloadManager | null = null;

/**
 * Loads the downloads on the device and carries on any that the app was closed in the middle of. Called once at launch
 * (main.tsx); the actions below call it too, so it is safe to call again.
 */
export function startDownloads(): Promise<void> {
  if (!downloadsSupported()) return Promise.resolve();
  manager ??= new DownloadManager({ meta: idbMeta, files: opfsFiles(), net: absNet, env: browserEnv(), publish });
  return manager.ready;
}

const unsupported: StartResult = { ok: false, reason: "This browser can't keep books on the device." };

const run = async <T>(fallback: T, fn: (m: DownloadManager) => T | Promise<T>): Promise<T> => {
  await startDownloads();
  return manager ? fn(manager) : fallback;
};

/** Downloads a book. Resolves with why not, in words for the listener, when it can't start. */
export const startDownload = (itemId: string): Promise<StartResult> => run(unsupported, (m) => m.start(itemId));
export const pauseDownload = (itemId: string): Promise<void> => run(undefined, (m) => m.pause(itemId));
export const resumeDownload = (itemId: string): Promise<void> => run(undefined, (m) => m.resume(itemId));
/** Cancels a download in progress, or removes a finished one: its files, details and object URLs. */
export const removeDownload = (itemId: string): Promise<void> => run(undefined, (m) => m.remove(itemId));

/**
 * For playing offline (the next phase): object URLs of the book's files in play order, each typed to play (m4b as
 * audio/mp4), when the whole book is on the device; else null. The URLs last until the download is removed.
 */
export const localTrackUrls = (itemId: string): Promise<string[] | null> => run(null, (m) => m.localTrackUrls(itemId));

/** What was saved to play the book offline (tracks, chapters, title, author, duration, library), or null. */
export const downloadedItem = (itemId: string): Promise<DownloadedItem | null> => run(null, (m) => m.item(itemId));

/** The signed-in user may download (ABS's download permission). Offline, the user last signed in here. */
export function useCanDownload(): boolean {
  // The session App.tsx holds (never fetched from here), else the copy kept for offline.
  const { data: user } = useQuery({
    queryKey: ['session'],
    queryFn: restoreSession,
    staleTime: Infinity,
    enabled: false,
  });
  return canDownload(user ?? rememberedUser());
}

/** Space the downloads take, from their records, and what the device says is free (null when it won't say). */
export async function downloadSpace(): Promise<{ used: number; free: number | null }> {
  const used = books.reduce((n, b) => n + b.bytes, 0);
  try {
    const e = await navigator.storage.estimate();
    return {
      used,
      free: typeof e.quota === 'number' && typeof e.usage === 'number' ? Math.max(0, e.quota - e.usage) : null,
    };
  } catch {
    return { used, free: null };
  }
}
