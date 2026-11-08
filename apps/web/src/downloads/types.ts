// The shapes of downloads: what the app reads (DownloadedBook) and what is kept on the device to play a book offline.
import type { Chapter } from '../api/items';

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

/** One audio file of a downloaded book, in play order. */
export interface SavedTrack {
  index: number;
  ino: string;
  filename: string;
  /** The type to play it with: never ABS's audio/m4b, which WebKit doesn't know (see playMime). */
  mimeType: string;
  /** Bytes, per ABS. */
  size: number;
  /** Seconds into the book where this file starts, and its length. */
  startOffset: number;
  duration: number;
}

/** What a downloaded book keeps to play with no connection (the next phase reads it). */
export interface DownloadedItem {
  itemId: string;
  libraryId: string;
  title: string;
  author: string;
  /** Seconds. */
  duration: number;
  chapters: Chapter[];
  tracks: SavedTrack[];
  /** The item's updatedAt on the server when it was downloaded. */
  updatedAt: number;
}

/** What IndexedDB holds per book: the details, and where the download stands. */
export interface DownloadRecord extends DownloadedItem {
  totalBytes: number;
  bytes: number;
  status: DownloadStatus;
  error?: string;
  addedAt: number;
  completedAt?: number;
  /** A cover was saved beside the files. */
  hasCover: boolean;
  /** Paused by the app, not the listener: it carries on by itself when the app is open and online. */
  autoResume?: boolean;
  /** Who downloaded it, on which server (lastUser.ts's serverKey). */
  userId?: string;
  server?: string;
}
