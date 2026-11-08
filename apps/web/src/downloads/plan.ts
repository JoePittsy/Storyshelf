// Pure decisions for downloads: which files, where they go, whether a book fits, what an error means to the listener.
// The resume rules (Range, 206 append, 200 restart) are the storage test's, proven on the iPhone: see storageTest/plan.ts.
import type { Chapter } from '../api/items';
import { cleanChapters } from '../player/chapters';
import { playMime } from '../storageTest/plan';
import type { DownloadRecord, SavedTrack } from './types';

export { readReply, resumePlan, type ReplyAction, type ResumePlan } from '../storageTest/plan';

/** The OPFS folder that holds every download, one folder per book inside it. */
export const DOWNLOADS_DIR = 'storyshelf-downloads';
/** The cover's file name in a book's folder. */
export const COVER_FILE = 'cover.jpg';

/** The parts of GET /api/items/:id?expanded=1 (ABS 2.37) a download keeps. */
export interface ExpandedItem {
  id: string;
  libraryId: string;
  updatedAt: number;
  media: {
    metadata: { title: string; authorName?: string | null };
    duration: number;
    chapters?: Chapter[];
    tracks?: {
      index: number;
      ino: string;
      startOffset?: number;
      duration?: number;
      mimeType?: string;
      metadata?: { filename?: string; size?: number };
    }[];
  };
}

/** ABS 2.37's per-file download: checks the user's download permission and honours Range. */
export const fileDownloadPath = (itemId: string, ino: string): string =>
  `/api/items/${encodeURIComponent(itemId)}/file/${encodeURIComponent(ino)}/download`;

export const coverPath = (itemId: string): string =>
  `/api/items/${encodeURIComponent(itemId)}/cover?width=512&format=jpeg`;

/** A name that's safe as an OPFS entry. */
export const safeName = (s: string): string => s.replace(/[^\w.-]/g, '_');

/** A track's file in its book's folder: its inode, keeping the extension. */
export function trackFile(t: Pick<SavedTrack, 'ino' | 'filename'>): string {
  const ext = (t.filename.split('.').pop() ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  return safeName(`${t.ino}.${ext}`);
}

/** The tracks of an expanded item, in play order, with what playing them offline needs. */
export function savedTracks(item: ExpandedItem): SavedTrack[] {
  return [...(item.media.tracks ?? [])]
    .sort((a, b) => a.index - b.index)
    .map((t) => {
      const filename = t.metadata?.filename ?? `track-${t.index}`;
      return {
        index: t.index,
        ino: String(t.ino),
        filename,
        mimeType: playMime(t.mimeType, filename),
        size: t.metadata?.size ?? 0,
        startOffset: t.startOffset ?? 0,
        duration: t.duration ?? 0,
      };
    });
}

/** A new record for a book about to download. */
export function newRecord(
  item: ExpandedItem,
  now: number,
  who: { userId?: string; server?: string } = {}
): DownloadRecord {
  const tracks = savedTracks(item);
  return {
    itemId: item.id,
    libraryId: item.libraryId,
    title: item.media.metadata.title,
    author: item.media.metadata.authorName ?? '',
    duration: item.media.duration,
    chapters: cleanChapters(item.media.chapters),
    tracks,
    updatedAt: item.updatedAt,
    totalBytes: tracks.reduce((n, t) => n + t.size, 0),
    bytes: 0,
    status: 'queued',
    addedAt: now,
    hasCover: false,
    ...who,
  };
}

/** Room kept free beyond the book itself, so a download never fills the device to the last byte. */
export const SPACE_MARGIN = 50 * 1000 * 1000;

/**
 * Whether `needed` more bytes fit in what navigator.storage.estimate() reports. With no estimate (an older browser),
 * it is allowed: the write itself fails if it doesn't fit, and the listener is told then.
 */
export function spaceCheck(
  needed: number,
  estimate: { quota?: number; usage?: number } | null
): { ok: true } | { ok: false; free: number } {
  if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') return { ok: true };
  const free = Math.max(0, estimate.quota - estimate.usage);
  return needed + SPACE_MARGIN <= free ? { ok: true } : { ok: false, free };
}

/** Mirrors ABS's own check (User.canDownload): the user's download permission. */
export const canDownload = (user: { permissions?: Record<string, boolean> } | null | undefined): boolean =>
  !!user?.permissions?.download;

/** Bytes as the iPhone's own Settings shows them (powers of 1000): "820 MB", "1.4 GB". */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1e9) return `${Math.max(1, Math.round(n / 1e6))} MB`;
  return `${(n / 1e9).toFixed(1)} GB`;
}

/** Whole percent, never 100 until it's done. */
export const percentOf = (bytes: number, total: number): number =>
  total > 0 ? Math.min(99, Math.floor((bytes / total) * 100)) : 0;

/** Waits between tries after a network failure. After the last, the download stops and says why. */
export const RETRY_DELAYS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** What a failed attempt means: try again, or stop and tell the listener. */
export type Failure = { kind: 'retry' } | { kind: 'fatal'; why: string };

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

/** The body ended before the file was whole, or stopped arriving: resumable. */
export class ShortReadError extends Error {
  constructor(message = 'The download stopped short') {
    super(message);
    this.name = 'ShortReadError';
  }
}

/** A file came out bigger than ABS said: it changed on the server after the book was queued. */
export class ChangedError extends Error {
  constructor() {
    super('The file is bigger than the server said');
    this.name = 'ChangedError';
  }
}

/** The listener-facing words for why a download stopped. */
export const WHY = {
  noPermission: "Your account isn't allowed to download books. The server's admin can change that.",
  gone: "The server doesn't have this book's files any more.",
  changed: "The book's files have changed on the server. Remove the download and try again.",
  full: 'This device ran out of space.',
  signedOut: 'You were signed out. Sign in and try again.',
  unreachable: "Couldn't reach the server. Try again when the connection is better.",
  offline: 'Waiting for a connection. It carries on when you are back online.',
  background: 'Paused while the app was in the background. It carries on when you come back.',
  closed: 'Stopped when the app closed. It carries on while the app is open and online.',
  noFiles: 'This book has no audio files to download.',
} as const;

/** Decides what an error from one attempt means. */
export function classify(e: unknown): Failure {
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = (e as { message?: string } | null)?.message ?? String(e);
  if (e instanceof HttpError) {
    if (e.status === 403) return { kind: 'fatal', why: WHY.noPermission };
    if (e.status === 404) return { kind: 'fatal', why: WHY.gone };
    if (e.status === 401) return { kind: 'fatal', why: WHY.signedOut };
    if (e.status === 408 || e.status === 429 || e.status >= 500) return { kind: 'retry' };
    return { kind: 'fatal', why: `The server refused the download (HTTP ${e.status}).` };
  }
  if (e instanceof ChangedError) return { kind: 'fatal', why: WHY.changed };
  if (name === 'AbsError' && (e as { status?: number }).status === 401) return { kind: 'fatal', why: WHY.signedOut };
  // The worker reports the original error's name at the start of its message.
  if (name === 'QuotaExceededError' || /QuotaExceeded/i.test(message)) return { kind: 'fatal', why: WHY.full };
  if (name === 'WorkerError') return { kind: 'fatal', why: `Couldn't save the book on this device. ${message}` };
  // fetch's TypeError (no network, a dropped connection, "Load failed"), a timeout, a stalled or short body.
  return { kind: 'retry' };
}
