// Pure decisions for the storage test: which URL, whether to resume, what a reply means, which MIME type to play with.

/** One audio file of a book, from the expanded item's media.tracks[] (play order). */
export interface Track {
  index: number;
  ino: string;
  mimeType?: string;
  duration?: number;
  metadata?: { filename?: string; size?: number; ext?: string };
}

/** ABS 2.37: checks the user's download permission and honours Range. */
export const DEFAULT_ENDPOINT = '/api/items/{id}/file/{ino}/download';

/** Fills {id} and {ino} in the editable endpoint template. */
export const fileUrl = (template: string, itemId: string, ino: string): string =>
  template.split('{id}').join(encodeURIComponent(itemId)).split('{ino}').join(encodeURIComponent(ino));

export function largestTrack(tracks: Track[]): Track | undefined {
  return tracks.reduce<Track | undefined>(
    (best, t) => (!best || (t.metadata?.size ?? 0) > (best.metadata?.size ?? 0) ? t : best),
    undefined
  );
}

export interface ResumePlan {
  /** The Range header to send, or null for a whole-file request. */
  range: string | null;
  /** Where the bytes of a 206 reply go. */
  offset: number;
  /** The file is already the expected size: nothing to fetch. */
  complete: boolean;
}

/** `existing` bytes already on disk; `expected` the file's full size when known. */
export function resumePlan(existing: number, expected?: number | null): ResumePlan {
  const have = Number.isFinite(existing) && existing > 0 ? Math.floor(existing) : 0;
  if (expected && have >= expected) return { range: null, offset: have, complete: true };
  if (have === 0) return { range: null, offset: 0, complete: false };
  return { range: `bytes=${have}-`, offset: have, complete: false };
}

export type ReplyAction =
  { kind: 'append'; offset: number } | { kind: 'restart' } | { kind: 'complete' } | { kind: 'fail'; why: string };

/**
 * What to do with the reply to a request made under `plan`. A 200 to a Range request means the server sent the whole
 * file: start again from 0. Cross-origin, Content-Range can't be read, so the status alone decides.
 */
export function readReply(status: number, plan: ResumePlan): ReplyAction {
  if (status === 206) return plan.range ? { kind: 'append', offset: plan.offset } : { kind: 'restart' };
  if (status === 200) return { kind: 'restart' };
  if (status === 416 && plan.range) return { kind: 'complete' };
  return { kind: 'fail', why: `HTTP ${status}` };
}

/**
 * The type to give the Blob for <audio>. WebKit wants one, and ABS labels m4b as audio/m4b, which WebKit doesn't
 * know: that becomes audio/mp4.
 */
export function playMime(mimeType: string | undefined | null, filename?: string): string {
  const ext = filename?.split('.').pop()?.toLowerCase();
  const m = (mimeType ?? '').toLowerCase();
  if (m === 'audio/m4b' || m === 'audio/x-m4b' || (!m && (ext === 'm4b' || ext === 'm4a'))) return 'audio/mp4';
  if (m) return m;
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
  if (ext === 'flac') return 'audio/flac';
  return 'audio/mp4';
}

/** A file name that's safe in OPFS and as a cache key: item and ino, keeping the extension. */
export function storedName(itemId: string, ino: string, filename?: string): string {
  const ext = (filename?.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  return `${itemId}-${ino}.${ext}`.replace(/[^\w.-]/g, '_');
}
