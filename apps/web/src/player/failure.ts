import { UnsupportedFormatError } from './session';

/** A failure that arrives within this long of the last reported one is the same failure seen twice. */
export const SAME_FAILURE_MS = 2000;

/**
 * Whether a track's format is one the browser can't play. `MEDIA_ERR_SRC_NOT_SUPPORTED` also fires when a session's
 * track URL dies (the server restarted), so it only means "format" when the track's own MIME type says no. A track
 * with no MIME type gives no evidence, so it isn't blamed.
 */
export function formatUnsupported(mimeType: string | undefined, canPlayType: (type: string) => string): boolean {
  return !!mimeType && canPlayType(mimeType) === '';
}

/** The error to report for a media element's SRC_NOT_SUPPORTED: the format message only with evidence of a bad format. */
export function srcNotSupportedError(mimeType: string | undefined, canPlayType: (type: string) => string): Error {
  return formatUnsupported(mimeType, canPlayType)
    ? new UnsupportedFormatError()
    : new Error('Track could not be loaded');
}

/** One toast per failure: a second report close behind the first (the error event and the play() rejection) is dropped. */
export function isRepeatFailure(lastAt: number | null, now: number): boolean {
  return lastAt !== null && now - lastAt < SAME_FAILURE_MS;
}
