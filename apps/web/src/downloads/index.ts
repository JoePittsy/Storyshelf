/**
 * Downloads: books kept on the device to play with no connection. This is the module's public face, which the rest
 * of the app reads (the offline home, the book page, Settings). The store behind it is a placeholder with no downloads
 * until downloading lands; keep these names and shapes stable when it does.
 */
import { useSyncExternalStore } from 'react';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'complete' | 'failed';

export interface DownloadedBook {
  itemId: string;
  libraryId: string;
  title: string;
  author: string;
  /** An object URL of the cover saved with the book, or null when none was saved. */
  coverUrl: string | null;
  /** Seconds. */
  duration: number;
  /** Bytes saved so far, and the book's total. */
  bytes: number;
  totalBytes: number;
  status: DownloadStatus;
  /** Why it stopped, in words for the listener, when status is 'failed' (or 'paused' by the system). */
  error?: string;
  /** ms since the epoch: when the download was asked for. */
  addedAt: number;
}

let books: DownloadedBook[] = [];
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const snapshot = (): DownloadedBook[] => books;

/** Every download, newest first. A new array whenever anything about one changes. */
export const useDownloads = (): DownloadedBook[] => useSyncExternalStore(subscribe, snapshot, snapshot);

/** The download for a book, if any. */
export const downloadOf = (itemId: string): DownloadedBook | undefined => books.find((b) => b.itemId === itemId);

/** A book that is on the device in full and can play with no connection. */
export const isDownloaded = (itemId: string): boolean => downloadOf(itemId)?.status === 'complete';

/** For tests and stories: replace what the store holds. */
export function setDownloadsForTests(next: DownloadedBook[]): void {
  books = next;
  listeners.forEach((cb) => cb());
}
