// STUB: tests-first. Behaviour is specified by session.test.ts. Do not edit the tests.
import type { Chapter } from './chapters';
import type { AudioTrack } from './timeline';

export interface PlaybackSession {
  id: string;
  libraryItemId: string;
  currentTime: number;
  duration: number;
  playMethod: number;
  audioTracks: AudioTrack[];
  chapters: Chapter[];
  displayTitle: string;
  displayAuthor: string;
}

export class UnsupportedFormatError extends Error {}

/** POST /api/items/:id/play. deviceId persisted in localStorage key 'storyshelf.deviceId' (generated with crypto.randomUUID once; storage failures tolerated → in-memory id). clientName 'Storyshelf'. supportedMimeTypes passed in. playMethod !== 0 → throw UnsupportedFormatError. */
export function openSession(_libraryItemId: string, _supportedMimeTypes: string[]): Promise<PlaybackSession> {
  throw new Error('not implemented');
}

/** POST /api/session/:id/sync. On 404, open a fresh session for the same item (same mime types) and sync that one; resolves with the session now active. Empty 200 body OK. */
export function syncSession(
  _s: PlaybackSession,
  _p: { currentTime: number; timeListened: number; duration: number },
  _supportedMimeTypes: string[],
): Promise<PlaybackSession> {
  throw new Error('not implemented');
}

/** POST /api/session/:id/close with keepalive: true. Never rejects (best effort). */
export function closeSession(
  _s: PlaybackSession,
  _p?: { currentTime: number; timeListened: number; duration: number },
): Promise<void> {
  throw new Error('not implemented');
}

/** `/public/session/${s.id}/track/${index}` */
export function trackUrl(_s: PlaybackSession, _index: number): string {
  throw new Error('not implemented');
}
